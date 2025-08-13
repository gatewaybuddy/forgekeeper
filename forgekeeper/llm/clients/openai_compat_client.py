"""OpenAI-compatible HTTP client with streaming support."""

from __future__ import annotations

import json
import os
from typing import Any, Callable, Dict, Iterable, Iterator

import requests

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


def _sse_request(url: str, payload: Dict[str, Any], stream_handler: Callable[[str], None] | None) -> Iterator[str]:
    """Send a streaming request and yield tokens from SSE responses."""
    with requests.post(url, json=payload, stream=True) as response:
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
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
                if stream_handler:
                    stream_handler(token)
                yield token


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

    if stream:
        payload["stream"] = True
        return _sse_request(url, payload, stream_handler)

    response = requests.post(url, json=payload)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]


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

    if stream:
        payload["stream"] = True
        return _sse_request(url, payload, stream_handler)

    response = requests.post(url, json=payload)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["text"]


__all__ = ["chat", "completion"]
