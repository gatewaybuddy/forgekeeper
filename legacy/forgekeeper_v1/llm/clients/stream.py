from __future__ import annotations

"""Streaming helpers for OpenAI-compatible responses."""

import json
import time
from typing import Any, Callable, Dict, Iterator

import requests

from forgekeeper.logger import get_logger
from forgekeeper.telemetry import (
    estimate_tokens,
    log_request_metrics,
    log_stream_backpressure,
    log_stream_end,
    log_stream_start,
    log_stream_token,
)

log = get_logger(__name__)


def _sse_request(
    url: str,
    payload: Dict[str, Any],
    model_alias: str,
    stream_handler: Callable[[str], None] | None,
) -> Iterator[str]:
    """Send a streaming request and yield tokens from SSE responses."""
    prompt_text = payload.get("prompt") or "".join(
        m.get("content", "") for m in payload.get("messages", [])
    )
    completion_chunks: list[str] = []
    start = time.time()
    log_stream_start(model_alias)
    with requests.post(url, json=payload, stream=True) as response:
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                log_stream_backpressure(model_alias)
                continue
            if not line.startswith("data: "):
                log.debug("Stream control line for %s: %s", model_alias, line)
                continue
            data = line[6:]
            if data.strip() == "[DONE]":
                break
            event = json.loads(data)
            # Chat completions use ``delta.content``; text completions use ``text``.
            delta = event["choices"][0].get("delta", {})
            token = delta.get("content")
            if token is None:
                token = event["choices"][0].get("text")
            if token:
                completion_chunks.append(token)
                if stream_handler:
                    stream_handler(token)
                log_stream_token(model_alias, token)
                yield token
    latency = time.time() - start
    prompt_tokens = estimate_tokens(prompt_text)
    completion_tokens = estimate_tokens("".join(completion_chunks))
    log_stream_end(model_alias)
    log_request_metrics(model_alias, prompt_tokens, completion_tokens, latency)


__all__ = ["_sse_request"]
