"""vLLM-backed LLM wrappers for core and coder agents."""

from __future__ import annotations

import os
import time
from typing import Any, Dict, Iterable

import requests

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.telemetry import log_server_launch
from forgekeeper.llm.clients import client, config as client_config
from forgekeeper.app.utils.prompt_guard import verify_prompt
from forgekeeper.app.utils.json_helpers import extract_json
from forgekeeper.inference_backends.harmony import render_harmony

log = get_logger(__name__, debug=DEBUG_MODE)


def _wait_for_healthz(timeout: float = 60.0, interval: float = 1.0) -> None:
    """Block until configured vLLM endpoints respond to ``/healthz``.

    Controlled by env:
      - FK_HEALTHZ_CHECK: "0" to disable (default enabled)
      - FK_HEALTHZ_TIMEOUT: seconds (default 60)
      - FK_HEALTHZ_INTERVAL: seconds (default 1)
    """
    if os.getenv("FK_HEALTHZ_CHECK", "1") == "0":
        return

    # Collect base URLs from the OpenAI-compat client map
    urls: Dict[str, str] = {}
    for alias, env_var in client_config.MODEL_BASE_URL_ENV.items():
        base = os.getenv(env_var)
        if base:
            urls[alias] = base.rstrip("/")

    if not urls:
        return

    log_server_launch(urls)

    try:
        timeout = float(os.getenv("FK_HEALTHZ_TIMEOUT", timeout))
        interval = float(os.getenv("FK_HEALTHZ_INTERVAL", interval))
    except Exception:
        pass

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
                log.warning("Health check error for %s at %s: %s", alias, health, exc)
            if time.time() > deadline:
                raise RuntimeError(f"Health check timed out for {alias} ({health})")
            time.sleep(interval)


# Best-effort health check at import time (can be disabled via env)
try:
    _wait_for_healthz()
except Exception as exc:  # pragma: no cover - do not hard crash import
    log.warning("vLLM health check failed: %s", exc)


def _alias_settings(alias: str) -> Dict[str, Any]:
    """Return generation parameters for ``alias`` from environment."""
    prefix = f"FK_{alias.upper()}_"
    settings: Dict[str, Any] = {}
    temperature = os.getenv(prefix + "TEMPERATURE")
    if temperature is not None:
        settings["temperature"] = float(temperature)
    top_p = os.getenv(prefix + "TOP_P")
    if top_p is not None:
        settings["top_p"] = float(top_p)
    max_tokens = os.getenv(prefix + "MAX_TOKENS")
    if max_tokens is not None:
        settings["max_tokens"] = int(max_tokens)
    model = os.getenv(f"VLLM_MODEL_{alias.upper()}")
    if model:
        settings["model"] = model
    return settings


class _RemoteLLM:
    def __init__(self, alias: str) -> None:
        self.alias = alias

    def ask(self, prompt: str, **overrides: Any) -> str:
        prompt = verify_prompt(prompt)
        params = {**_alias_settings(self.alias), **overrides}
        model_name = params.get("model")
        if model_name == "gpt-oss-20b-harmony":
            harmony = render_harmony([{ "role": "user", "content": prompt }], None)
            messages = [{"role": "user", "content": harmony}]
        else:
            messages = [{"role": "user", "content": prompt}]

        # If the coder model or its base URL are missing, fallback immediately to core.
        if self.alias == "coder":
            base_env = client_config.MODEL_BASE_URL_ENV.get("coder")
            base_set = base_env and os.getenv(base_env)
            if not os.getenv("VLLM_MODEL_CODER") or not base_set:
                log.warning("Coder model unavailable; routing request to core")
                params = {**_alias_settings("core"), **overrides}
                result = client.chat("core", messages, **params)
                if isinstance(result, dict):
                    return result.get("content", "")
                return "".join(result)

        try:
            result: Dict[str, Any] | Iterable[str] = client.chat(
                self.alias, messages, **params
            )
        except Exception as exc:  # noqa: BLE001  # pragma: no cover - network errors
            if self.alias == "coder":
                log.warning(
                    "Coder model unavailable; routing request to core: %s", exc
                )
                params = {**_alias_settings("core"), **overrides}
                result = client.chat("core", messages, **params)
            else:
                raise
        if isinstance(result, dict):
            return result.get("content", "")
        return "".join(result)


llm_core = _RemoteLLM("core")
llm_coder = _RemoteLLM("coder")


def ask_llm(prompt: str, parse_json: bool = False, **kwargs: Any) -> str | dict:
    """Backward-compatible helper that proxies to ``llm_core``.

    Args:
        prompt: User prompt to send.
        parse_json: If True, attempt to parse JSON from the response.
        **kwargs: Extra generation params (temperature/top_p/max_tokens/model/etc).

    Returns:
        str by default; if parse_json=True, returns dict on success, else raw text.
    """
    text = llm_core.ask(prompt, **kwargs)
    if not parse_json:
        return text
    try:
        return extract_json(text)
    except Exception:
        return text


__all__ = ["llm_core", "llm_coder", "ask_llm"]
