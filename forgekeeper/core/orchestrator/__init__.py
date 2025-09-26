"""Orchestrator package exposing duet/single agents and helpers."""

from __future__ import annotations

from .adapters import LLMBase, LLMMock, ToolBase, ToolEvent
from .buffers import Buffers
from .contracts import (
    DEFAULT_ORCHESTRATOR_EXPECTATIONS,
    DefaultPolicyProvider,
    EventSink,
    LLMEndpoint,
    OrchestratorContracts,
    OrchestratorExpectations,
    PolicyProvider,
    SimpleToolRouter,
    ToolRouter,
    default_event_sink,
    default_llm_endpoint,
    default_policy_provider,
    default_tool_router,
)
from .events import Event, JsonlRecorder, Watermark
from .facts import FactsStore
from .config import DefaultOrchestratorConfig
from .orchestrator import Orchestrator
from .policies import FloorPolicy, TriggerPolicy
from .summary import compact
from .single import SingleOrchestrator

__all__ = [
    "LLMBase",
    "LLMMock",
    "ToolBase",
    "ToolEvent",
    "LLMEndpoint",
    "ToolRouter",
    "EventSink",
    "PolicyProvider",
    "OrchestratorContracts",
    "OrchestratorExpectations",
    "DEFAULT_ORCHESTRATOR_EXPECTATIONS",
    "SimpleToolRouter",
    "DefaultPolicyProvider",
    "DefaultOrchestratorConfig",
    "default_llm_endpoint",
    "default_tool_router",
    "default_event_sink",
    "default_policy_provider",
    "Event",
    "JsonlRecorder",
    "Watermark",
    "Buffers",
    "FactsStore",
    "FloorPolicy",
    "TriggerPolicy",
    "compact",
    "Orchestrator",
    "SingleOrchestrator",
]
