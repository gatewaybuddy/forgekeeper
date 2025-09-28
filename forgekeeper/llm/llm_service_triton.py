"""HTTP client for Triton-backed responses."""

from __future__ import annotations

import json
import os
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Mapping

import requests

from forgekeeper import config
from forgekeeper.inference_backends.harmony import HarmonyConfig, render_harmony


@dataclass(slots=True)
class HarmonyResponse:
    """Represents a single Harmony response from the llmcore server."""

    text: str
    analysis: str
    tool_calls: List[Mapping[str, Any]]
    raw: Mapping[str, Any]
    response_id: str | None = None
    model: str | None = None
    finish_reason: str | None = None

    def __str__(self) -> str:  # pragma: no cover - convenience
        return self.text


class _HarmonyAccumulator:
    """Collects streamed Harmony events into a structured response."""

    def __init__(self, on_reasoning: Callable[[str], None] | None = None) -> None:
        self.on_reasoning = on_reasoning
        self.analysis_parts: List[str] = []
        self.final_parts: List[str] = []
        self.tool_calls: Dict[str, Dict[str, Any]] = {}
        self.tool_call_order: List[str] = []
        self.events: List[Mapping[str, Any]] = []
        self.output_messages: List[Mapping[str, Any]] = []
        self.response_id: str | None = None
        self.model: str | None = None
        self.finish_reason: str | None = None

    def _append_analysis(self, text: str) -> None:
        if not text:
            return
        self.analysis_parts.append(text)
        if self.on_reasoning:
            self.on_reasoning(text)

    def _append_final(self, text: str) -> None:
        if text:
            self.final_parts.append(text)

    def _ensure_tool_call(self, call_id: str) -> Dict[str, Any]:
        if call_id not in self.tool_calls:
            self.tool_calls[call_id] = {"id": call_id, "arguments": ""}
            self.tool_call_order.append(call_id)
        return self.tool_calls[call_id]

    def _process_content_item(self, item: Mapping[str, Any], default_channel: str | None = None) -> None:
        item_type = item.get("type")
        channel = item.get("channel") or default_channel
        text = item.get("text") or ""

        if item_type in {"reasoning", "analysis"} or channel == "analysis":
            self._append_analysis(text)
        elif item_type in {"output_text", "text", "final"} or channel == "final":
            self._append_final(text)

        if item_type in {"tool_call", "function_call"}:
            call_id = item.get("id") or f"call_{len(self.tool_call_order)}"
            call_entry = self._ensure_tool_call(str(call_id))
            for key in ("name", "tool_name", "function", "recipient", "type"):
                if item.get(key) is not None:
                    call_entry[key] = item[key]
            if "input" in item:
                call_entry["input"] = item["input"]

    def _process_content(self, contents: Iterable[Mapping[str, Any]], default_channel: str | None = None) -> None:
        for content in contents:
            if isinstance(content, Mapping):
                self._process_content_item(content, default_channel)

    def _process_output(self, output: Any) -> None:
        if isinstance(output, Mapping):
            output_items = [output]
        else:
            output_items = list(output or [])

        for item in output_items:
            if not isinstance(item, Mapping):
                continue
            self.output_messages.append(item)
            channel = item.get("channel")
            contents = item.get("content")
            if isinstance(contents, Iterable):
                self._process_content(contents, channel)

    def _record_tool_delta(self, delta: Mapping[str, Any]) -> None:
        call_id = str(delta.get("id") or delta.get("call_id") or len(self.tool_call_order))
        entry = self._ensure_tool_call(call_id)
        arguments = delta.get("arguments")
        if arguments:
            entry["arguments"] = entry.get("arguments", "") + str(arguments)
        for name_key in ("name", "tool_name", "function"):
            if delta.get(name_key):
                entry[name_key] = delta[name_key]

    def _process_delta(self, event_type: str | None, delta: Mapping[str, Any]) -> None:
        channel = delta.get("channel")
        text = delta.get("text")
        if text:
            if (event_type and "reasoning" in event_type) or channel == "analysis":
                self._append_analysis(str(text))
            else:
                self._append_final(str(text))

        content = delta.get("content")
        if isinstance(content, Iterable):
            self._process_content(content, channel)

        if any(key in delta for key in ("arguments", "tool_name", "function", "name")):
            self._record_tool_delta(delta)

    def process_event(self, event: Mapping[str, Any]) -> None:
        if not event:
            return
        self.events.append(event)
        self.response_id = event.get("id", self.response_id)
        self.model = event.get("model", self.model)
        event_type = event.get("type")

        if "output" in event:
            self._process_output(event["output"])

        delta = event.get("delta")
        if isinstance(delta, Mapping):
            self._process_delta(event_type, delta)

        if event_type == "response.completed":
            self.finish_reason = event.get("status") or event.get("response", {}).get("status", "completed")
        elif event_type == "response.error":  # pragma: no cover - defensive
            raise ValueError(f"Harmony error: {json.dumps(event)}")

    def to_response(self) -> HarmonyResponse:
        tool_calls = [self.tool_calls[call_id] for call_id in self.tool_call_order]
        raw: Dict[str, Any] = {
            "events": self.events,
            "output": self.output_messages,
        }
        return HarmonyResponse(
            text="".join(self.final_parts),
            analysis="".join(self.analysis_parts),
            tool_calls=tool_calls,
            raw=raw,
            response_id=self.response_id,
            model=self.model,
            finish_reason=self.finish_reason,
        )


@dataclass(slots=True)
class TritonClient:
    base_url: str
    model: str
    timeout: int = 60
    last_response: HarmonyResponse | None = field(default=None, init=False)

    def ask(
        self,
        prompt: str,
        *,
        stream: bool = True,
        return_response: bool = False,
        on_reasoning: Callable[[str], None] | None = None,
    ) -> str | HarmonyResponse:
        """Query the llmcore server and optionally stream chain-of-thought.

        Args:
            prompt: The user prompt to send to the server.
            stream: Whether to request streaming responses. Streaming enables
                incremental delivery of reasoning tokens and tool call payloads.
            return_response: If ``True`` the full :class:`HarmonyResponse`
                object is returned instead of just the final text.
            on_reasoning: Optional callback invoked whenever a reasoning delta
                chunk is received during streaming.
        """

        payload = {
            "model": self.model,
            "input": self._render_input(prompt),
        }

        if stream:
            payload["stream"] = True
            result = self._streaming_request(payload, on_reasoning=on_reasoning)
        else:
            result = self._standard_request(payload, on_reasoning=on_reasoning)

        self.last_response = result
        return result if return_response else result.text

    def _streaming_request(
        self,
        payload: Mapping[str, Any],
        *,
        on_reasoning: Callable[[str], None] | None = None,
    ) -> HarmonyResponse:
        response = requests.post(
            f"{self.base_url}/v1/responses",
            json=dict(payload),
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
            stream=True,
        )
        response.raise_for_status()
        accumulator = _HarmonyAccumulator(on_reasoning=on_reasoning)
        try:
            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    continue
                if line.startswith("data:"):
                    chunk = line[5:].strip()
                    if chunk == "[DONE]":
                        break
                    with suppress(json.JSONDecodeError):
                        accumulator.process_event(json.loads(chunk))
        finally:
            response.close()
        return accumulator.to_response()

    def _standard_request(
        self,
        payload: Mapping[str, Any],
        *,
        on_reasoning: Callable[[str], None] | None = None,
    ) -> HarmonyResponse:
        response = requests.post(
            f"{self.base_url}/v1/responses",
            json=dict(payload),
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        accumulator = _HarmonyAccumulator(on_reasoning=on_reasoning)
        accumulator.process_event(data)
        return accumulator.to_response()

    def _render_input(self, prompt: str) -> Any:
        if "harmony" in self.model:
            harmony_config = HarmonyConfig(tool_channel_note="functions")
            return render_harmony([
                {"role": "user", "content": prompt},
            ], harmony_config)
        return prompt


def handle_mcp_request(_request: Mapping[str, Any]) -> Mapping[str, Any]:
    """Stub for future Model Context Protocol request handling."""

    raise NotImplementedError("MCP request handling has not been implemented yet.")


llm_core = TritonClient(
    base_url=os.getenv("FK_CORE_API_BASE", config.FK_CORE_API_BASE),
    model=os.getenv("TRITON_MODEL_CORE", config.TRITON_MODEL_CORE or config.DEFAULT_TINY_MODEL),
)


__all__ = ["HarmonyResponse", "TritonClient", "handle_mcp_request", "llm_core"]

