from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from forgekeeper.core.orchestrator import (
    DefaultOrchestratorConfig,
    Orchestrator,
    SimpleToolRouter,
    ToolEvent,
    default_policy_provider,
)
from forgekeeper.core.orchestrator.adapters import LLMMock, ToolBase
from forgekeeper.core.orchestrator.contracts import OrchestratorContracts
from forgekeeper.core.orchestrator.events import Event, JsonlRecorder
from forgekeeper.core.orchestrator.facts import FactsStore
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
    config = DefaultOrchestratorConfig(
        recorder_path=rec_path,
        inbox_path=tmp_path / "inbox.jsonl",
        facts_path=tmp_path / "facts.json",
        llm_a=LLMMock("Plan"),
        llm_b=LLMMock("Build"),
        tools=[],
    )
    orch = Orchestrator(contracts=config.build())
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
    config = DefaultOrchestratorConfig(
        recorder_path=rec_path,
        inbox_path=tmp_path / "inbox.jsonl",
        facts_path=tmp_path / "facts.json",
        llm_a=LLMMock("A"),
        llm_b=LLMMock("B"),
        tools=[tool],
    )
    orch = Orchestrator(contracts=config.build())
    await orch.run(duration_s=0.2)
    text = rec_path.read_text(encoding="utf-8")
    assert '"role":"tool"' in text
    assert '"status":"ok"' in text


@pytest.mark.asyncio
async def test_inbox_messages_are_ingested(tmp_path: Path) -> None:
    rec_path = tmp_path / "duet_events.jsonl"
    inbox_path = tmp_path / "inbox.jsonl"
    inbox_recorder = JsonlRecorder(inbox_path)

    async def feed_inbox() -> None:
        await asyncio.sleep(0.05)
        await inbox_recorder.append(
            Event(
                seq=1,
                wm_event_time_ms=0,
                role="user",
                stream="ui",
                act="INPUT",
                text="hello-from-inbox",
            )
        )

    config = DefaultOrchestratorConfig(
        recorder_path=rec_path,
        inbox=inbox_recorder,
        facts_path=tmp_path / "facts.json",
        llm_a=LLMMock("Plan"),
        llm_b=LLMMock("Build"),
        tools=[],
    )
    orch = Orchestrator(contracts=config.build())

    await asyncio.gather(orch.run(duration_s=0.4), feed_inbox())

    text = rec_path.read_text(encoding="utf-8")
    assert "hello-from-inbox" in text


@pytest.mark.asyncio
async def test_orchestrator_allows_custom_contracts(tmp_path: Path) -> None:
    rec_path = tmp_path / "custom_events.jsonl"
    inbox_path = tmp_path / "custom_inbox.jsonl"
    contracts = OrchestratorContracts(
        llm_a=LLMMock("Plan"),
        llm_b=LLMMock("Build"),
        tool_router=SimpleToolRouter([]),
        event_sink=JsonlRecorder(rec_path),
        inbox=JsonlRecorder(inbox_path),
        facts=FactsStore(tmp_path / "facts.json"),
        policy_provider=default_policy_provider(),
    )

    orch = Orchestrator(contracts=contracts)
    await orch.run(duration_s=0.3)

    text = rec_path.read_text(encoding="utf-8")
    assert "orchestrator:start" in text
