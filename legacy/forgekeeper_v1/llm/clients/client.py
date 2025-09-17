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
    headers = {}
    api_key = (
        __import__('os').environ.get('FK_API_KEY')
        or __import__('os').environ.get('FGK_INFER_KEY')
        or None
    )
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    if stream:
        payload["stream"] = True
        # _sse_request currently does not accept headers; perform inline request for streaming
        import requests
        import json as _json
        prompt_text = "".join(m.get("content", "") for m in messages)
        completion_chunks: list[str] = []
        start = time.time()
        from forgekeeper.telemetry import (
            estimate_tokens,
            log_stream_backpressure,
            log_stream_end,
            log_stream_start,
            log_stream_token,
        )
        log_stream_start(model_alias)
        with requests.post(url, json=payload, headers=headers, stream=True) as response:
            response.raise_for_status()
            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    log_stream_backpressure(model_alias)
                    continue
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data.strip() == "[DONE]":
                    break
                event = _json.loads(data)
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
        _log_metrics(model_alias, prompt_text, "".join(completion_chunks), latency, {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens})
        return

    start = time.time()
    response = requests.post(url, json=payload, headers=headers)
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
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    latency = time.time() - start
    data = response.json()
    text = data["choices"][0]["text"]
    usage = data.get("usage", {})
    _log_metrics(model_alias, prompt_text, text, latency, usage)
    return text


__all__ = ["chat", "completion"]
