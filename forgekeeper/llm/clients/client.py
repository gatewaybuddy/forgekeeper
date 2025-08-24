"""OpenAI-compatible HTTP client with streaming support."""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, Iterable

import requests

from .config import _get_base_url
from .stream import _sse_request
from forgekeeper.telemetry import estimate_tokens, log_request_metrics


def _log_metrics(
    model_alias: str,
    prompt_text: str,
    completion_text: str,
    latency: float,
    usage: Dict[str, Any],
) -> None:
    """Log token and latency metrics for a request."""
    prompt_tokens = usage.get("prompt_tokens") or estimate_tokens(prompt_text)
    completion_tokens = usage.get("completion_tokens") or estimate_tokens(
        completion_text
    )
    log_request_metrics(model_alias, prompt_tokens, completion_tokens, latency)


def chat(
    model_alias: str,
    messages: list[Dict[str, Any]],
    *,
    stream: bool = False,
    stream_handler: Callable[[str], None] | None = None,
    **kwargs: Any,
) -> Iterable[str] | Dict[str, Any]:
    """Perform a chat completion request."""
    url = f"{_get_base_url(model_alias)}/v1/chat/completions"
    payload: Dict[str, Any] = {
        "model": kwargs.pop("model", model_alias),
        "messages": messages,
        **kwargs,
    }

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
    _log_metrics(model_alias, prompt_text, text, latency, usage)
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
    payload: Dict[str, Any] = {
        "model": kwargs.pop("model", model_alias),
        "prompt": prompt,
        **kwargs,
    }

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
    _log_metrics(model_alias, prompt_text, text, latency, usage)
    return text


__all__ = ["chat", "completion"]
