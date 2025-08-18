from __future__ import annotations

import re
from typing import Any, Dict

from forgekeeper.logger import get_logger

log = get_logger(__name__)

_TOKEN_PATTERN = re.compile(r"\S+")


def estimate_tokens(text: str | None) -> int:
    """Estimate token count using whitespace separation."""
    if not text:
        return 0
    return len(_TOKEN_PATTERN.findall(text))


# ---------------------------------------------------------------------------
# Server-level telemetry
# ---------------------------------------------------------------------------

def log_server_launch(params: Dict[str, Any]) -> None:
    """Log server launch parameters."""
    log.info("Server launch parameters: %s", params)


# ---------------------------------------------------------------------------
# Request-level telemetry
# ---------------------------------------------------------------------------

def log_request_metrics(
    model: str, prompt_tokens: int, completion_tokens: int, latency: float
) -> None:
    """Log per-request token counts and latency."""
    log.info(
        "Request metrics | model=%s | prompt_tokens=%d | completion_tokens=%d | latency=%.2fms",
        model,
        prompt_tokens,
        completion_tokens,
        latency * 1000,
    )


# ---------------------------------------------------------------------------
# Streaming telemetry
# ---------------------------------------------------------------------------

def log_stream_start(model: str) -> None:
    """Log the start of a streaming response."""
    log.info("Stream started | model=%s", model)


def log_stream_token(model: str, token: str) -> None:
    """Log an individual streamed token (debug level)."""
    log.debug("Streaming token | model=%s | token=%s", model, token)


def log_stream_end(model: str) -> None:
    """Log the end of a streaming response."""
    log.info("Stream ended | model=%s", model)


def log_stream_backpressure(model: str) -> None:
    """Log that streaming backpressure was detected."""
    log.warning("Stream backpressure detected | model=%s", model)


# ---------------------------------------------------------------------------
# Background worker telemetry
# ---------------------------------------------------------------------------

def log_outbox_metrics(processed: int, retries: int) -> None:
    """Log cumulative outbox worker metrics."""
    log.info("Outbox metrics | processed=%d | retries=%d", processed, retries)


# ---------------------------------------------------------------------------
# Agent execution telemetry
# ---------------------------------------------------------------------------

from collections import defaultdict

# ``_agent_stats`` accumulates per-agent success/failure counts and total time.
_agent_stats: Dict[str, Dict[str, float]] = defaultdict(
    lambda: {"success": 0, "failure": 0, "total_time": 0.0}
)


def record_agent_result(agent: str, duration: float, success: bool) -> None:
    """Record the outcome of an agent task.

    Parameters
    ----------
    agent:
        Name of the agent that executed the task.
    duration:
        Time spent executing the task in seconds.
    success:
        ``True`` if the task completed successfully, ``False`` otherwise.
    """

    stats = _agent_stats[agent]
    stats["total_time"] += duration
    key = "success" if success else "failure"
    stats[key] += 1
    log.info(
        "Agent task | agent=%s | success=%s | duration=%.2fms",
        agent,
        success,
        duration * 1000,
    )


def get_agent_metrics() -> Dict[str, Dict[str, float]]:
    """Return a snapshot of aggregated agent metrics."""

    return {agent: dict(stats) for agent, stats in _agent_stats.items()}


__all__ = [
    "estimate_tokens",
    "log_server_launch",
    "log_request_metrics",
    "log_stream_start",
    "log_stream_token",
    "log_stream_end",
    "log_stream_backpressure",
    "log_outbox_metrics",
    "record_agent_result",
    "get_agent_metrics",
]
