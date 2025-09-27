"""Duet orchestrator coordinating two language-model agents."""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from .adapters import ToolBase, ToolEvent
from .buffers import Buffers
from .contracts import LLMEndpoint
from .events import Event, Watermark
from .policies import FloorPolicy, TriggerPolicy
from .summary import compact


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class Orchestrator:
    """Coordinates two LLM agents, optional tools, and contextual memory."""

    def __init__(
        self,
        *,
        contracts: "OrchestratorContracts",
        buffers: Optional[Buffers] = None,
    ) -> None:
        from .contracts import OrchestratorContracts  # Local import to avoid cycle during typing

        if not isinstance(contracts, OrchestratorContracts):  # pragma: no cover - defensive
            raise TypeError("contracts must be an instance of OrchestratorContracts")

        self.recorder = contracts.event_sink
        self.inbox = contracts.inbox
        self.facts = contracts.facts
        self.buffers = buffers or Buffers(maxlen=2000)
        self.llm_a = contracts.llm_a
        self.llm_b = contracts.llm_b
        self.tool_router = contracts.tool_router
        self.tools = list(self.tool_router.iter_tools())

        self.wm = Watermark(interval_ms=500)
        self.policy_provider = contracts.policy_provider
        self.floor = self.policy_provider.floor
        self.trig_a = self.policy_provider.trigger_for("botA")
        self.trig_b = self.policy_provider.trigger_for("botB")
        self._last_seq_by_role: dict[str, int] = {"botA": 0, "botB": 0}
        self._seq = 0

    # ------------------------------------------------------------------
    # Event helpers

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    async def ingest(
        self,
        role: str,
        text: str,
        act: str,
        stream: str,
        *,
        meta: Optional[dict[str, Any]] = None,
    ) -> Event:
        event = Event(
            seq=self._next_seq(),
            wm_event_time_ms=self.wm.tick(),
            role=role,
            stream=stream,
            act=act,
            text=text,
            meta=meta or {},
        )
        self.buffers.append(event)
        await self.recorder.append(event)
        if role == "user" and stream != "system":
            self.floor.mark_user_active()
        elif role in {"botA", "botB"} and act != "THINK":
            (self.trig_a if role == "botA" else self.trig_b).activity()
        return event

    def _build_prompt(self, speaker: str) -> str:
        system = "You are a paired agent. Be concise. Use <THINK>/<PROPOSE>/<REPORT> acts."
        summary = "\n".join(compact(self.buffers.B_raw, limit=12))
        facts = "\n".join(f"- {key}: {value}" for key, value in self.facts.items()[:8])
        last_seq = self._last_seq_by_role.get(speaker, 0)
        window_events = self.buffers.window_since(last_seq)
        window = "\n".join(
            f"[{event.role}:{event.act}] {event.text}" for event in window_events[-20:]
        )
        watermark = f"Up to wm={self.wm.now_ms()}ms"
        return (
            f"SYSTEM:\n{system}\n\nSUMMARY:\n{summary}\n\nFACTS:\n{facts}\n\n"
            f"WINDOW:\n{window}\n\n{watermark}\n"
        )

    # ------------------------------------------------------------------
    # Agent turns

    async def _llm_turn(self, speaker: str, llm: LLMEndpoint, trig: TriggerPolicy) -> None:
        if self.floor.is_user_active():
            return
        if not trig.should_emit():
            trig.decay()
            return

        prompt = self._build_prompt(speaker)
        used_tokens = 0
        async for chunk, act in llm.stream(
            prompt, max_tokens=trig.max_tokens, time_slice_ms=self.floor.slice_ms
        ):
            used_tokens += _estimate_tokens(chunk)
            event = await self.ingest(
                "botA" if speaker == "botA" else "botB",
                chunk,
                act,
                stream=f"llm-{speaker}",
            )
            self._last_seq_by_role[speaker] = event.seq
            if used_tokens >= trig.max_tokens:
                break
        trig.mark_emitted()

    # ------------------------------------------------------------------
    # Tool + inbox pumps

    async def _start_tools(self) -> list[asyncio.Task[Any]]:
        tasks: list[asyncio.Task[Any]] = []
        await self.tool_router.start()
        self.tools = list(self.tool_router.iter_tools())
        for tool in self.tools:
            tasks.append(asyncio.create_task(self._pump_tool(tool)))
        return tasks

    async def _pump_tool(self, tool: ToolBase) -> None:
        async for payload in tool.astream_output():
            if isinstance(payload, ToolEvent):
                text = payload.text
                act = payload.act
                stream = payload.stream
                meta = payload.meta or {}
            else:
                text, act = payload
                stream, meta = "tool", {}
            if not text:
                continue
            await self.ingest("tool", text, act, stream=stream, meta=meta)

    async def _stop_tools(self) -> None:
        await self.tool_router.stop()

    async def _pump_inbox(self) -> None:
        async for event in self.inbox.tail():
            text = getattr(event, "text", "").strip()
            if not text:
                continue
            await self.ingest("user", text, "INPUT", stream="ui")

    # ------------------------------------------------------------------
    # Public entry point

    async def run(self, *, duration_s: Optional[float] = None) -> None:
        await self.ingest("user", "orchestrator:start", "INPUT", stream="system")
        tool_tasks = await self._start_tools()
        inbox_task: Optional[asyncio.Task[Any]] = None
        try:
            inbox_task = asyncio.create_task(self._pump_inbox())
        except Exception:
            inbox_task = None

        try:
            await self._llm_turn("botA", self.llm_a, self.trig_a)
            await self._llm_turn("botB", self.llm_b, self.trig_b)
            if duration_s:
                loop = asyncio.get_event_loop()
                start = loop.time()
                while loop.time() - start < duration_s:
                    speaker = self.floor.next_speaker()
                    if speaker == "user":
                        await asyncio.sleep(self.floor.slice_ms / 1000)
                        continue
                    if speaker == "botA":
                        await self._llm_turn("botA", self.llm_a, self.trig_a)
                    else:
                        await self._llm_turn("botB", self.llm_b, self.trig_b)
                    await asyncio.sleep(self.floor.slice_ms / 1000)
        finally:
            for task in tool_tasks:
                task.cancel()
            await self._stop_tools()
            if inbox_task:
                inbox_task.cancel()
            await self.ingest("user", "orchestrator:stop", "INPUT", stream="system")


__all__ = ["Orchestrator"]
