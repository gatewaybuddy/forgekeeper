from __future__ import annotations

import asyncio
from pathlib import Path
import pytest

from forgekeeper_v2.orchestrator.orchestrator import Orchestrator
from forgekeeper_v2.orchestrator.adapters import LLMMock


@pytest.mark.asyncio
async def test_orchestrator_duet_runs(tmp_path: Path) -> None:
    rec_path = tmp_path / "events.jsonl"
    orch = Orchestrator(recorder_path=rec_path, llm_a=LLMMock("A"), llm_b=LLMMock("B"), tools=[])
    await orch.run(duration_s=2.0)
    text = rec_path.read_text(encoding="utf-8")
    assert "orchestrator:start" in text
    assert '"role":"botA"' in text
    assert '"role":"botB"' in text

