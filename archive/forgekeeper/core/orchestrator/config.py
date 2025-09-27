"""Configuration helpers for creating orchestrator dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

from .adapters import ToolBase
from .contracts import (
    EventSink,
    LLMEndpoint,
    OrchestratorContracts,
    PolicyProvider,
    ToolRouter,
    default_event_sink,
    default_llm_endpoint,
    default_policy_provider,
    default_tool_router,
)
from .facts import FactsStore


@dataclass(slots=True)
class DefaultOrchestratorConfig:
    """Helper for assembling :class:`Orchestrator` dependencies.

    The core orchestrator accepts fully constructed contract objects.  This
    configuration class centralises the default wiring so production code and
    tests can easily opt into the stock ``LLMMock`` strategies, JSONL-backed
    recorders, and tool routing without coupling the orchestrator itself to
    specific implementations.
    """

    recorder_path: Path | str = Path(".forgekeeper/events.jsonl")
    inbox_path: Path | str = Path(".forgekeeper/inbox_user.jsonl")
    facts_path: Path | str = Path(".forgekeeper/facts.json")
    llm_a: Optional[LLMEndpoint] = None
    llm_b: Optional[LLMEndpoint] = None
    tools: Optional[Iterable[ToolBase]] = None
    tool_router: Optional[ToolRouter] = None
    event_sink: Optional[EventSink] = None
    inbox: Optional[EventSink] = None
    facts: Optional[FactsStore] = None
    policy_provider: Optional[PolicyProvider] = None

    def build(self) -> OrchestratorContracts:
        """Materialise :class:`OrchestratorContracts` using defaults where needed."""

        event_sink = self.event_sink or default_event_sink(self.recorder_path)
        inbox = self.inbox or default_event_sink(self.inbox_path)
        facts = self.facts or FactsStore(Path(self.facts_path))
        tool_router = self.tool_router or default_tool_router(self.tools)
        policy_provider = self.policy_provider or default_policy_provider()

        return OrchestratorContracts(
            llm_a=self.llm_a or default_llm_endpoint("botA"),
            llm_b=self.llm_b or default_llm_endpoint("botB"),
            tool_router=tool_router,
            event_sink=event_sink,
            inbox=inbox,
            facts=facts,
            policy_provider=policy_provider,
        )


__all__ = ["DefaultOrchestratorConfig"]

