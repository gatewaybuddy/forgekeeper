"""Helper functions for creating review-related ContextLog events.

This module provides utilities for creating structured events for the self-review
iteration feature (M2). All events follow the ContextLog schema defined in
ADR-0002.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import uuid4


def create_review_cycle_event(
    conv_id: str,
    trace_id: str,
    iteration: int,
    review_pass: int,
    quality_score: float,
    threshold: float,
    critique: str,
    accepted: bool,
    elapsed_ms: int,
    status: str = "ok",
) -> dict[str, Any]:
    """Create a review_cycle event for ContextLog.

    Args:
        conv_id: Conversation ID
        trace_id: Trace ID for correlation
        iteration: Orchestrator iteration number
        review_pass: Which review pass this is (1-N)
        quality_score: Quality score from review (0.0-1.0)
        threshold: Threshold required to accept (0.0-1.0)
        critique: Brief critique text
        accepted: Whether response was accepted at this quality level
        elapsed_ms: Time taken for this review pass
        status: Status (ok or error)

    Returns:
        Event dictionary ready for ContextLog append
    """
    return {
        "id": str(uuid4()),
        "ts": datetime.utcnow().isoformat(),
        "actor": "system",
        "act": "review_cycle",
        "conv_id": conv_id,
        "trace_id": trace_id,
        "iter": iteration,
        "name": "self_review",
        "status": status,
        "review_pass": review_pass,
        "quality_score": round(quality_score, 3),
        "threshold": round(threshold, 3),
        "critique": critique[:500] if critique else "",  # Cap critique length
        "accepted": accepted,
        "elapsed_ms": elapsed_ms,
    }


def create_regeneration_event(
    conv_id: str,
    trace_id: str,
    iteration: int,
    attempt: int,
    reason: str,
    previous_score: float,
    elapsed_ms: int,
    status: str = "ok",
) -> dict[str, Any]:
    """Create a regeneration event for ContextLog.

    Args:
        conv_id: Conversation ID
        trace_id: Trace ID for correlation
        iteration: Orchestrator iteration number
        attempt: Which regeneration attempt (1-N)
        reason: Reason for regeneration (usually critique)
        previous_score: Quality score that triggered regeneration
        elapsed_ms: Time taken for regeneration
        status: Status (ok or error)

    Returns:
        Event dictionary ready for ContextLog append
    """
    return {
        "id": str(uuid4()),
        "ts": datetime.utcnow().isoformat(),
        "actor": "assistant",
        "act": "regeneration",
        "conv_id": conv_id,
        "trace_id": trace_id,
        "iter": iteration,
        "name": "regenerate_with_critique",
        "status": status,
        "attempt": attempt,
        "reason": reason[:500] if reason else "",
        "previous_score": round(previous_score, 3),
        "elapsed_ms": elapsed_ms,
    }


def create_review_summary_event(
    conv_id: str,
    trace_id: str,
    iteration: int,
    total_passes: int,
    final_score: float,
    regeneration_count: int,
    accepted: bool,
    total_elapsed_ms: int,
    status: str = "ok",
) -> dict[str, Any]:
    """Create a review_summary event for ContextLog.

    This event summarizes the entire review process for a response.

    Args:
        conv_id: Conversation ID
        trace_id: Trace ID for correlation
        iteration: Orchestrator iteration number
        total_passes: Total number of review passes performed
        final_score: Final quality score achieved
        regeneration_count: Number of regenerations triggered
        accepted: Whether final response was accepted
        total_elapsed_ms: Total time for all review cycles
        status: Status (ok or error)

    Returns:
        Event dictionary ready for ContextLog append
    """
    return {
        "id": str(uuid4()),
        "ts": datetime.utcnow().isoformat(),
        "actor": "system",
        "act": "review_summary",
        "conv_id": conv_id,
        "trace_id": trace_id,
        "iter": iteration,
        "name": "review_complete",
        "status": status,
        "total_passes": total_passes,
        "final_score": round(final_score, 3),
        "regeneration_count": regeneration_count,
        "accepted": accepted,
        "total_elapsed_ms": total_elapsed_ms,
    }


def truncate_text(text: str, max_length: int = 500, suffix: str = "...") -> str:
    """Truncate text to max_length with suffix.

    Args:
        text: Text to truncate
        max_length: Maximum length
        suffix: Suffix to append when truncated

    Returns:
        Truncated text
    """
    if not text:
        return ""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix
