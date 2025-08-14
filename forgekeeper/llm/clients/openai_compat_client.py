"""OpenAI-compatible HTTP client with streaming support."""

from __future__ import annotations

import json
import os
import time
from typing import Any, Callable, Dict, Iterable, Iterator

import requests

from forgekeeper.logger import get_logger
from forgekeeper.telemetry import (
    estimate_tokens,
    log_request_metrics,
    log_stream_start,
    log_stream_token,
    log_stream_end,
    log_stream_backpressure,
)

log = get_logger(__name__)

# Environment variables mapping model aliases to their base URLs.
MODEL_BASE_URL_ENV: Dict[str, str] = {
    "core": "FK_CORE_API_BASE",
    "coder": "FK_CODER_API_BASE",
}


def _get_base_url(model_alias: str) -> str:
    """Resolve the API base URL for a given ``model_alias``.

    Parameters
    ----------
    model_alias:
        Alias identifying which model server to target. Expected values are
        ``"core"`` or ``"coder"``.
    """
    env_var = MODEL_BASE_URL_ENV.get(model_alias)
    if not env_var:
        raise ValueError(f"Unknown model alias: {model_alias}")
    base_url = os.getenv(env_var)
    if not base_url:
        raise ValueError(f"Environment variable {env_var} is not set")
    return base_url.rstrip("/")


def _sse_request(
    url: str,
    payload: Dict[str, Any],
    model_alias: str,
    stream_handler: Callable[[str], None] | None,
) -> Iterator[str]:
    """Send a streaming request and yield tokens from SSE responses."""
    prompt_text = payload.get("prompt") or "".join(m.get("content", "") for m in payload.get("messages", []))
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


def chat(
    model_alias: str,
    messages: list[Dict[str, Any]],
    *,
    stream: bool = False,
    stream_handler: Callable[[str], None] | None = None,
    **kwargs: Any,
) -> Iterable[str] | Dict[str, Any]:
    """Perform a chat completion request.

    When ``stream`` is ``False`` a full OpenAI-style ``message`` dict is
    returned so that callers can inspect fields such as ``tool_calls``. When
    ``stream`` is ``True`` an iterator of string tokens is returned.  ``tools``
    and ``tool_choice`` parameters are forwarded verbatim via ``kwargs``.
    """
    url = f"{_get_base_url(model_alias)}/v1/chat/completions"
    payload: Dict[str, Any] = {"model": kwargs.pop("model", model_alias), "messages": messages, **kwargs}

    prompt_text = "".join(m.get("content", "") for m in messages)
    if stream:
        payload["stream"] = True
        return _sse_request(url, payload, model_alias, stream_handler)

    start = time.time()
    response = requests.post(url, json=payload)
    response.raise_for_status()
    latency = time.time() - start
    data = response.json()
    message = data["choices"][0]["message"]
    text = message.get("content", "")
    usage = data.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens") or estimate_tokens(prompt_text)
    completion_tokens = usage.get("completion_tokens") or estimate_tokens(text)
    log_request_metrics(model_alias, prompt_tokens, completion_tokens, latency)
    return message


def completion(
    model_alias: str,
    prompt: str,
    *,
    stream: bool = False,
    stream_handler: Callable[[str], None] | None = None,
    **kwargs: Any,
) -> Iterable[str] | str:
    """Perform a text completion request."""
    url = f"{_get_base_url(model_alias)}/v1/completions"
    payload: Dict[str, Any] = {"model": kwargs.pop("model", model_alias), "prompt": prompt, **kwargs}

    prompt_text = prompt
    if stream:
        payload["stream"] = True
        return _sse_request(url, payload, model_alias, stream_handler)

    start = time.time()
    response = requests.post(url, json=payload)
    response.raise_for_status()
    latency = time.time() - start
    data = response.json()
    text = data["choices"][0]["text"]
    usage = data.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens") or estimate_tokens(prompt_text)
    completion_tokens = usage.get("completion_tokens") or estimate_tokens(text)
    log_request_metrics(model_alias, prompt_tokens, completion_tokens, latency)
    return text


__all__ = ["chat", "completion"]
