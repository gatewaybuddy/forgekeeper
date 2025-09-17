from __future__ import annotations

"""Configuration utilities for LLM HTTP clients."""

import os
from typing import Dict

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


__all__ = ["_get_base_url", "MODEL_BASE_URL_ENV"]
