from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Optional

from forgekeeper_v2.memory import FactsStore, compact
from .buffers import Buffers
from .events import Act, Event, JsonlRecorder, Role, Watermark
from .policies import FloorPolicy, TriggerPolicy
from .adapters import LLMBase, LLMMock, ToolBase


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class Orchestrator:
    def __init__(
        self,
        recorder_path: Path | str = ".forgekeeper/events.jsonl",
        llm_a: Optional[LLMBase] = None,
        llm_b: Optional[LLMBase] = None,
        tools: Optional[list[ToolBase]] = None,
    ) -> None:
        self.wm = Watermark(interval_ms=500)
        self.recorder = JsonlRecorder(recorder_path)
        self.buffers = Buffers(maxlen=2000)
        self.facts = FactsStore(Path(".forgekeeper/facts.json"))
        self.seq = 0
        self.llm_a = llm_a or LLMMock("Strategist")
        self.llm_b = llm_b or LLMMock("Implementer")
        self.tools: list[ToolBase] = tools or []
        self.trig_a = TriggerPolicy(max_latency_s=1.0, min_silence_s=0.2)
        self.trig_b = TriggerPolicy(max_latency_s=1.0, min_silence_s=0.2)
        self.floor = FloorPolicy(slice_ms=1000)
        self._last_seq_by_role: dict[str, int] = {"botA": 0, "botB": 0}
        self._allowlist = {"echo", "dir", "ls", "Get-Date"}

    def _next_seq(self) -> int:
        self.seq += 1
        return self.seq

    async def ingest(self, role: Role, text: str, act: Act, stream: str, meta: Optional[dict[str, Any]] = None) -> Event:
        ev = Event(
            seq=self._next_seq(),
            wm_event_time_ms=self.wm.now_ms(),
            role=role,
            stream=stream,
            act=act,
            text=text,
            meta=meta or {},
        )
        self.buffers.append(ev)
        await self.recorder.append(ev)
        if role in ("botA", "botB") and act != "THINK":
            (self.trig_a if role == "botA" else self.trig_b).activity()
        return ev

    def _build_prompt(self, speaker: str) -> str:
        system = "You are a paired agent. Be concise. Use <THINK>/<PROPOSE>/<REPORT> acts."
        summary = "\n".join(compact(self.buffers.B_raw, limit=12))
        facts = "\n".join(f"- {k}: {v}" for k, v in self.facts.items()[:8])
        last_seq = self._last_seq_by_role.get(speaker, 0)
        window_events = self.buffers.window_since(last_seq)
        win = "\n".join(f"[{e.role}:{e.act}] {e.text}" for e in window_events[-20:])
        watermark = f"Up to wm={self.wm.now_ms()}ms"
        return (
            f"SYSTEM:\n{system}\n\nSUMMARY:\n{summary}\n\nFACTS:\n{facts}\n\nWINDOW:\n{win}\n\n{watermark}\n"
        )

    async def _llm_turn(self, speaker: str, llm: LLMBase, trig: TriggerPolicy) -> None:
        if self.floor.is_user_active():
            return
        if not trig.should_emit():
            trig.decay()
            return
        prompt = self._build_prompt(speaker)
        time_slice_ms = self.floor.slice_ms
        used_tokens = 0
        async for chunk, act in llm.stream(prompt, max_tokens=256, time_slice_ms=time_slice_ms):
            used_tokens += _estimate_tokens(chunk)
            ev = await self.ingest("botA" if speaker == "botA" else "botB", chunk, act, stream=f"llm-{speaker}")
            self._last_seq_by_role[speaker] = ev.seq
            if used_tokens >= 256:
                break
        trig.mark_emitted()

    async def _tool_pump(self, tool: ToolBase) -> None:
        async for ev in tool.astream_output():
            await self.ingest("tool", ev.text, ev.act, stream=ev.stream, meta=ev.meta)

    async def start_tools(self) -> list[asyncio.Task[Any]]:
        tasks: list[asyncio.Task[Any]] = []
        for t in self.tools:
            await t.start()
            tasks.append(asyncio.create_task(self._tool_pump(t)))
        return tasks

    async def stop_tools(self) -> None:
        for t in self.tools:
            try:
                await t.stop()
            except Exception:
                pass

    async def run(self, duration_s: Optional[float] = None) -> None:
        await self.ingest("user", "orchestrator:start", "INPUT", stream="system")
        # Warm-up before any background tasks that may mark user activity
        try:
            await self._llm_turn("botA", self.llm_a, self.trig_a)
            await self._llm_turn("botB", self.llm_b, self.trig_b)
            await self.ingest("user", "warmup-complete", "INPUT", stream="system")
        except Exception as e:
            try:
                await self.ingest("user", f"warmup-error: {e}", "INPUT", stream="system")
            except Exception:
                pass

        tool_tasks = await self.start_tools()
        inbox_task: Optional[asyncio.Task[Any]] = None
        try:
            from forgekeeper_v2.orchestrator.events import JsonlRecorder as JR, Event as _E
            inbox = JR(Path(".forgekeeper/inbox_user.jsonl"))
            async def _pump_inbox() -> None:
                async for ev in inbox.tail(start_offset=None):
                    try:
                        self.floor.mark_user_active()
                        text = ev.text if isinstance(ev, _E) else getattr(ev, 'text', '')
                        if text:
                            await self.ingest("user", text, "INPUT", stream="ui")
                            self.trig_a.nudge()
                            self.trig_b.nudge()
                    except Exception:
                        continue
            inbox_task = asyncio.create_task(_pump_inbox())
        except Exception:
            inbox_task = None
        start = asyncio.get_event_loop().time()
        try:
            while True:
                if duration_s is not None and (asyncio.get_event_loop().time() - start) >= duration_s:
                    break
                speaker = self.floor.next_speaker()
                if speaker == "user":
                    await asyncio.sleep(0.1)
                    continue
                if speaker == "botA":
                    await self._llm_turn("botA", self.llm_a, self.trig_a)
                else:
                    await self._llm_turn("botB", self.llm_b, self.trig_b)
                await asyncio.sleep(self.floor.slice_ms / 1000)
                if len(self.buffers.B_raw) > 240:
                    bullets = compact(self.buffers.B_raw, limit=20)
                    self.buffers.S_running = bullets
        finally:
            for task in tool_tasks:
                task.cancel()
            await self.stop_tools()
            if inbox_task:
                inbox_task.cancel()
