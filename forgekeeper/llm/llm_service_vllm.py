"""vLLM-backed LLM wrappers for core and coder agents."""

from __future__ import annotations

import os
from typing import Any, Dict, Iterable

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.llm.clients import openai_compat_client
from forgekeeper.app.utils.prompt_guard import verify_prompt

log = get_logger(__name__, debug=DEBUG_MODE)


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
        messages = [{"role": "user", "content": prompt}]
        params = {**_alias_settings(self.alias), **overrides}
        try:
            result: Dict[str, Any] | Iterable[str] = openai_compat_client.chat(
                self.alias, messages, **params
            )
        except Exception as exc:  # noqa: BLE001  # pragma: no cover - network errors
            if self.alias == "coder":
                log.warning(
                    "Coder model unavailable; routing request to core: %s", exc
                )
                params = {**_alias_settings("core"), **overrides}
                result = openai_compat_client.chat("core", messages, **params)
            else:
                raise
        if isinstance(result, dict):
            return result.get("content", "")
        return "".join(result)


llm_core = _RemoteLLM("core")
llm_coder = _RemoteLLM("coder")


def ask_llm(prompt: str, **kwargs: Any) -> str:
    """Backward compatible helper that proxies to ``llm_core``."""
    return llm_core.ask(prompt, **kwargs)


__all__ = ["llm_core", "llm_coder", "ask_llm"]
