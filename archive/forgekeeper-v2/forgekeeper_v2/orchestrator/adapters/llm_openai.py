from __future__ import annotations

import asyncio
import os
from typing import Any, AsyncGenerator, Iterator, Optional

from .llm_base import LLMBase


class LLMOpenAI(LLMBase):
    def __init__(self, model: str, name: str = "openai") -> None:
        self.name = name
        self.model = model

    async def stream(
        self, prompt: str, max_tokens: int = 256, time_slice_ms: int = 1000
    ) -> AsyncGenerator[tuple[str, str], None]:
        try:
            from openai import OpenAI, OpenAIError  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("openai package not installed; pip install openai") from exc

        client = OpenAI()
        messages = [
            {
                "role": "system",
                "content": "You are Forgekeeper v2 agent. Use <THINK>/<PROPOSE>/<REPORT> tags.",
            },
            {"role": "user", "content": prompt},
        ]

        def _should_disable_harmony() -> bool:
            flag = os.environ.get("FGK_OPENAI_DISABLE_HARMONY", "1").strip().lower()
            return flag not in {"0", "false", "off"}

        extra_headers: Optional[dict[str, str]] = None
        if _should_disable_harmony():
            extra_headers = {"OpenAI-Experimental-Disable-Harmony": "true"}

        def _iter_text_entries(value: Any) -> Iterator[str]:
            if not value:
                return
            if isinstance(value, str):
                text = value.strip()
                if text:
                    yield text
                return
            if isinstance(value, (list, tuple)):
                for item in value:
                    yield from _iter_text_entries(item)
                return
            if isinstance(value, dict):
                for key in ("text", "content", "message"):
                    if key in value:
                        yield from _iter_text_entries(value[key])
                return
            text = str(value).strip()
            if text:
                yield text

        def _split_message_parts(message: Any) -> tuple[list[str], list[str]]:
            reasoning_chunks: list[str] = []
            report_chunks: list[str] = []

            content = getattr(message, "content", None)
            if isinstance(content, str):
                report_chunks.extend(_iter_text_entries(content))
            elif isinstance(content, (list, tuple)):
                for part in content:
                    part_type = getattr(part, "type", None)
                    if isinstance(part, dict):
                        part_type = part.get("type", part_type)
                    bucket = (
                        reasoning_chunks
                        if (part_type or "").lower() in {"reasoning", "thought", "chain_of_thought"}
                        else report_chunks
                    )
                    for piece in _iter_text_entries(part):
                        bucket.append(piece)
            elif content:
                report_chunks.extend(_iter_text_entries(content))

            model_extra = getattr(message, "model_extra", None)
            if isinstance(model_extra, dict):
                for key in ("reasoning", "reasoning_content"):
                    if key in model_extra:
                        reasoning_chunks.extend(_iter_text_entries(model_extra[key]))

            if not reasoning_chunks and hasattr(message, "reasoning_content"):
                reasoning_chunks.extend(_iter_text_entries(getattr(message, "reasoning_content")))

            return reasoning_chunks, report_chunks

        def _chat(extra_body: Optional[dict[str, object]] = None):
            kwargs = {
                "model": self.model,
                "messages": messages,
                "max_tokens": max_tokens,
                "stream": False,
            }
            if extra_headers:
                kwargs["extra_headers"] = extra_headers
            if extra_body:
                kwargs["extra_body"] = extra_body
            return client.chat.completions.create(**kwargs)

        def _completion_prompt() -> str:
            sys_lines = [m.get("content", "") for m in messages if m.get("role") == "system"]
            user_lines = [m.get("content", "") for m in messages if m.get("role") == "user"]
            return "\n".join([*sys_lines, *user_lines])

        def _completion_fallback():
            prompt_text = _completion_prompt()
            return client.completions.create(
                model=self.model,
                prompt=prompt_text,
                max_tokens=max_tokens,
            )

        def _request():
            extra_opts = {"max_output_messages": 4, "reasoning": {"max_output_tokens": max_tokens}}
            try:
                return _chat(extra_opts)
            except OpenAIError:
                try:
                    return _chat(None)
                except OpenAIError:
                    return _completion_fallback()

        response = await asyncio.to_thread(_request)
        choice = response.choices[0]
        message = getattr(choice, "message", None)
        if message is not None:
            reasoning_chunks, report_chunks = _split_message_parts(message)
            for chunk in reasoning_chunks:
                if chunk:
                    yield chunk, "THINK"
            for chunk in report_chunks:
                if chunk:
                    yield chunk, "REPORT"
            if reasoning_chunks or report_chunks:
                return

        text_out = getattr(choice, "text", "") or ""
        lower = text_out.lower()
        if "<report>" in lower:
            before, after = text_out.split("<REPORT>", 1)
            think_part = before.strip()
            report_part = "<REPORT>" + after.strip()
        else:
            think_part = text_out.strip()
            report_part = ""
        if think_part:
            yield think_part, "THINK"
        if report_part:
            yield report_part, "REPORT"
