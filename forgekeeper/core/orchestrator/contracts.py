"""Contracts describing orchestrator dependencies and helper factories."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import (
    AsyncIterator,
    Iterable,
    Optional,
    Protocol,
    Tuple,
    runtime_checkable,
)

from .adapters import LLMMock, ToolBase
from .events import Event, JsonlRecorder
from .policies import FloorPolicy, TriggerPolicy


@runtime_checkable
class LLMEndpoint(Protocol):
    """Protocol implemented by language-model endpoints used by the orchestrator.

    The orchestrator expects streaming generation where each yielded chunk is a
    ``(text, act)`` tuple.  Providers should emit activity notifications through
    their ``TriggerPolicy`` (see :class:`PolicyProvider`) when non-``THINK`` acts
    are produced so scheduling heuristics remain accurate.
    """

    async def stream(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        time_slice_ms: int = 1000,
    ) -> AsyncIterator[Tuple[str, str]]:
        ...


@runtime_checkable
class ToolRouter(Protocol):
    """Protocol responsible for lifecycle management of registered tools."""

    async def start(self) -> None:
        """Start any background tasks required by the underlying tools."""

    async def stop(self) -> None:
        """Stop tools and release related resources."""

    def iter_tools(self) -> Iterable[ToolBase]:
        """Return an iterable of tools that should be pumped for output."""


@runtime_checkable
class EventSink(Protocol):
    """Protocol for recording orchestrator events."""

    async def append(self, event: Event) -> None:
        ...

    async def tail(self) -> AsyncIterator[Event]:
        ...


@runtime_checkable
class PolicyProvider(Protocol):
    """Protocol exposing timing/scheduling policies."""

    @property
    def floor(self) -> FloorPolicy:
        ...

    def trigger_for(self, role: str) -> TriggerPolicy:
        ...


@dataclass(slots=True)
class OrchestratorContracts:
    """Aggregate dependencies consumed by :class:`~.orchestrator.Orchestrator`."""

    llm_a: LLMEndpoint
    llm_b: LLMEndpoint
    tool_router: ToolRouter
    event_sink: EventSink
    policy_provider: PolicyProvider


@dataclass(frozen=True, slots=True)
class OrchestratorExpectations:
    """Documentation for the default dependency expectations."""

    streaming_api: str
    activity_notifications: str
    event_recording: str
    tool_pipeline: str


DEFAULT_ORCHESTRATOR_EXPECTATIONS = OrchestratorExpectations(
    streaming_api=(
        "LLM endpoints must provide an async ``stream`` generator that yields"
        " ``(text, act)`` pairs so partial responses can be surfaced in real time."
    ),
    activity_notifications=(
        "Trigger policies are tuned for streaming sources; providers should call"
        " ``TriggerPolicy.activity`` whenever non-``THINK`` acts are emitted so"
        " cadence heuristics stay calibrated."
    ),
    event_recording=(
        "Event sinks are expected to persist orchestration events and offer a"
        " ``tail`` async iterator for inbox-style consumption."
    ),
    tool_pipeline=(
        "Tool routers are responsible for starting tools before use, exposing"
        " them via ``iter_tools``, and shutting them down when orchestration"
        " completes."
    ),
)


class SimpleToolRouter(ToolRouter):
    """Router that simply wraps a static iterable of tools."""

    def __init__(self, tools: Optional[Iterable[ToolBase]] = None) -> None:
        self._tools: Tuple[ToolBase, ...] = tuple(tools or ())

    async def start(self) -> None:
        for tool in self._tools:
            await tool.start()

    async def stop(self) -> None:
        for tool in self._tools:
            try:
                await tool.stop()
            except Exception:
                continue

    def iter_tools(self) -> Iterable[ToolBase]:
        return self._tools


class DefaultPolicyProvider(PolicyProvider):
    """Policy provider returning static policies suitable for tests."""

    def __init__(
        self,
        *,
        trigger_a: Optional[TriggerPolicy] = None,
        trigger_b: Optional[TriggerPolicy] = None,
        floor: Optional[FloorPolicy] = None,
    ) -> None:
        self._floor = floor or FloorPolicy(slice_ms=600)
        self._triggers = {
            "botA": trigger_a or TriggerPolicy(max_latency_s=1.0, min_silence_s=0.2),
            "botB": trigger_b or TriggerPolicy(max_latency_s=1.0, min_silence_s=0.2),
        }

    @property
    def floor(self) -> FloorPolicy:  # pragma: no cover - simple accessor
        return self._floor

    def trigger_for(self, role: str) -> TriggerPolicy:
        try:
            return self._triggers[role]
        except KeyError as exc:  # pragma: no cover - defensive
            raise KeyError(f"Unknown role {role!r}") from exc


def default_llm_endpoint(role: str, *, message: str | None = None) -> LLMEndpoint:
    """Return the default mock endpoint for the requested role."""

    name = "Strategist" if role == "botA" else "Implementer"
    payload = message if message is not None else "ready"
    return LLMMock(name=name, message=payload)


def default_tool_router(tools: Optional[Iterable[ToolBase]] = None) -> ToolRouter:
    """Construct a :class:`ToolRouter` from raw tool instances."""

    return SimpleToolRouter(tools)


def default_event_sink(path: Path | str) -> EventSink:
    """Create an event sink backed by :class:`~.events.JsonlRecorder`."""

    return JsonlRecorder(path)


def default_policy_provider(
    *,
    trigger_a: Optional[TriggerPolicy] = None,
    trigger_b: Optional[TriggerPolicy] = None,
    floor: Optional[FloorPolicy] = None,
) -> PolicyProvider:
    """Build a :class:`PolicyProvider` with forgekeeper's default heuristics."""

    return DefaultPolicyProvider(trigger_a=trigger_a, trigger_b=trigger_b, floor=floor)


__all__ = [
    "LLMEndpoint",
    "ToolRouter",
    "EventSink",
    "PolicyProvider",
    "OrchestratorContracts",
    "OrchestratorExpectations",
    "DEFAULT_ORCHESTRATOR_EXPECTATIONS",
    "SimpleToolRouter",
    "DefaultPolicyProvider",
    "default_llm_endpoint",
    "default_tool_router",
    "default_event_sink",
    "default_policy_provider",
]
