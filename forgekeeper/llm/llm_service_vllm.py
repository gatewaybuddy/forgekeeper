"""vLLM backend service using OpenAI-compatible chat API."""

from __future__ import annotations

import os
import time
from typing import Any, Iterable, Dict

import requests

from forgekeeper.logger import get_logger
from forgekeeper.telemetry import log_server_launch
from forgekeeper.llm.clients import openai_compat_client
from forgekeeper.app.utils.prompt_guard import verify_prompt
from forgekeeper.app.utils.json_helpers import extract_json

log = get_logger(__name__)


def _wait_for_healthz(timeout: float = 60.0, interval: float = 1.0) -> None:
    """Block until all configured vLLM endpoints respond to ``/healthz``."""
    urls: Dict[str, str] = {}
    for alias, env_var in openai_compat_client.MODEL_BASE_URL_ENV.items():
        base = os.getenv(env_var)
        if base:
            urls[alias] = base.rstrip("/")
    if urls:
        log_server_launch(urls)
    deadline = time.time() + timeout
    for alias, base in urls.items():
        health = f"{base}/healthz"
        while True:
            try:
                resp = requests.get(health, timeout=5)
                if resp.status_code == 200:
                    log.info("Health check passed for %s at %s", alias, health)
                    break
            except Exception as exc:  # pragma: no cover - logging only
                log.warning("Health check failed for %s at %s: %s", alias, health, exc)
            if time.time() > deadline:
                raise RuntimeError(f"Health check timed out for {alias}")
            time.sleep(interval)


_wait_for_healthz()


def ask_llm(prompt: str, **kwargs: Any):
    """Send ``prompt`` to the vLLM backend and return parsed JSON response.

    Parameters
    ----------
    prompt:
        User prompt to send to the model.
    **kwargs:
        Additional parameters forwarded to :func:`openai_compat_client.chat`.

    Returns
    -------
    dict | str
        Parsed JSON object from the model response, or raw text if JSON cannot
        be extracted.
    """
    prompt = verify_prompt(prompt)
    messages = [{"role": "user", "content": prompt}]
    result: Dict[str, Any] | Iterable[str] = openai_compat_client.chat("core", messages, **kwargs)
    if isinstance(result, dict):
        text = result.get("content", "")
    else:
        text = "".join(result)
    return extract_json(text)


__all__ = ["ask_llm"]
