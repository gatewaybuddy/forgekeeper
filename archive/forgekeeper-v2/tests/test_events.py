from __future__ import annotations

import asyncio
from pathlib import Path
import pytest

from forgekeeper_v2.orchestrator.events import Event, JsonlRecorder, Watermark


@pytest.mark.asyncio
async def test_jsonl_recorder_roundtrip(tmp_path: Path) -> None:
    rec = JsonlRecorder(tmp_path / "ev.jsonl")
    wm = Watermark()
    e1 = Event(seq=1, wm_event_time_ms=wm.now_ms(), role="user", stream="cli", act="INPUT", text="hi")
    e2 = Event(seq=2, wm_event_time_ms=wm.now_ms(), role="botA", stream="llm-botA", act="REPORT", text="ok")
    await rec.append(e1)
    await rec.append(e2)
    all_e = rec.read_all()
    assert [e.seq for e in all_e] == [1, 2]

    async def _collect(n: int):
        out = []
        async for ev in rec.tail(start_offset=0):
            out.append(ev)
            if len(out) >= n:
                break
        return out

    got = await asyncio.wait_for(_collect(2), timeout=2.0)
    assert got[0].text == "hi"
    assert got[1].text == "ok"

