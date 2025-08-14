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


def log_server_launch(params: Dict[str, Any]) -> None:
    """Log server launch parameters."""
    log.info("Server launch parameters: %s", params)


def log_request_metrics(model: str, prompt_tokens: int, completion_tokens: int, latency: float) -> None:
    """Log per-request metrics."""
    log.info(
        "Request metrics | model=%s | prompt_tokens=%d | completion_tokens=%d | latency=%.2fms",
        model,
        prompt_tokens,
        completion_tokens,
        latency * 1000,
    )
