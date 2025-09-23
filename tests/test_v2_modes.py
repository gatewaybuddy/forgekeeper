from __future__ import annotations

import asyncio
import importlib
import time
from pathlib import Path

import pytest

from forgekeeper.core.orchestrator import Orchestrator, ToolEvent
from forgekeeper.core.orchestrator.adapters import LLMMock, ToolBase
from forgekeeper.core.orchestrator.events import Event, JsonlRecorder
from forgekeeper.core.orchestrator.single import SingleOrchestrator


@pytest.mark.asyncio
async def test_single_mode_records_events(tmp_path: Path) -> None:
    rec_path = tmp_path / "single_events.jsonl"
    orch = SingleOrchestrator(recorder_path=rec_path, llm=LLMMock("Solo"), tools=[])
    await orch.run(duration_s=0.2)
    text = rec_path.read_text(encoding="utf-8")
    assert "orchestrator:start" in text
    assert '"role":"botA"' in text
    assert '"role":"user"' in text


@pytest.mark.asyncio
async def test_duet_mode_records_events(tmp_path: Path) -> None:
    rec_path = tmp_path / "duet_events.jsonl"
    orch = Orchestrator(
        recorder_path=rec_path,
        llm_a=LLMMock("Plan"),
        llm_b=LLMMock("Build"),
        tools=[],
        inbox_path=tmp_path / "inbox.jsonl",
        facts_path=tmp_path / "facts.json",
    )
    await orch.run(duration_s=0.4)
    text = rec_path.read_text(encoding="utf-8")
    assert "orchestrator:start" in text
    assert '"role":"botA"' in text
    assert '"role":"botB"' in text


class EchoTool(ToolBase):
    def __init__(self, events: list[ToolEvent]) -> None:
        self._events = events

    async def astream_output(self):  # type: ignore[override]
        for event in self._events:
            yield event


@pytest.mark.asyncio
async def test_tool_events_recorded(tmp_path: Path) -> None:
    rec_path = tmp_path / "tool_events.jsonl"
    tool = EchoTool([ToolEvent(text="check", act="TOOL_OUT", meta={"status": "ok"})])
    orch = Orchestrator(
        recorder_path=rec_path,
        llm_a=LLMMock("A"),
        llm_b=LLMMock("B"),
        tools=[tool],
        inbox_path=tmp_path / "inbox.jsonl",
        facts_path=tmp_path / "facts.json",
    )
    await orch.run(duration_s=0.2)
    text = rec_path.read_text(encoding="utf-8")
    assert '"role":"tool"' in text
    assert '"status":"ok"' in text


@pytest.mark.asyncio
async def test_inbox_messages_are_ingested(tmp_path: Path) -> None:
    rec_path = tmp_path / "duet_events.jsonl"
    inbox_path = tmp_path / "inbox.jsonl"
    recorder = JsonlRecorder(inbox_path)

    async def feed_inbox() -> None:
        await asyncio.sleep(0.05)
        await recorder.append(
            Event(
                seq=1,
                wm_event_time_ms=0,
                role="user",
                stream="ui",
                act="INPUT",
                text="hello-from-inbox",
            )
        )

    orch = Orchestrator(
        recorder_path=rec_path,
        llm_a=LLMMock("Plan"),
        llm_b=LLMMock("Build"),
        tools=[],
        inbox_path=inbox_path,
        facts_path=tmp_path / "facts.json",
    )

    await asyncio.gather(orch.run(duration_s=0.4), feed_inbox())

    text = rec_path.read_text(encoding="utf-8")
    assert "hello-from-inbox" in text


def test_v2_single_mode_mock_runs_quickly(monkeypatch):
    monkeypatch.setenv("PYTHONUNBUFFERED", "1")
    argv = ["run", "--llm", "mock", "--mode", "single", "--no-tools", "--duration", "0.2"]
    cli = importlib.import_module("forgekeeper_v2.cli")
    start = time.time()
    cli.main(argv)
    assert time.time() - start < 5


def test_v2_duet_mode_mock_runs_quickly(monkeypatch):
    monkeypatch.setenv("PYTHONUNBUFFERED", "1")
    argv = ["run", "--llm", "mock", "--mode", "duet", "--no-tools", "--duration", "0.2"]
    cli = importlib.import_module("forgekeeper_v2.cli")
    start = time.time()
    cli.main(argv)
    assert time.time() - start < 5


def test_pkg_entry_conversation_flag_parses(monkeypatch):
    import forgekeeper.__main__ as entry

    try:
        entry.main(["--conversation", "run", "--llm", "mock", "--mode", "duet", "--no-tools", "--duration", "0.1"])
    except SystemExit as e:
        assert isinstance(e.code, int) or e.code is None
