"""Configuration helpers for the unified runtime."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List



def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}



def _split_env(name: str) -> List[str]:
    value = os.getenv(name, "")
    parts: List[str] = []
    for chunk in value.split("\n"):
        chunk = chunk.strip()
        if not chunk:
            continue
        parts.extend([cmd.strip() for cmd in chunk.split(";") if cmd.strip()])
    return parts


DEFAULT_TINY_MODEL = os.getenv("FK_DEFAULT_TINY_MODEL", "hf-internal-testing/tiny-random-gpt2")
USE_TINY_MODEL = _bool_env("USE_TINY_MODEL")
FK_LLM_IMPL = os.getenv("FK_LLM_IMPL", "transformers")
FK_MODEL_PATH = os.getenv("FK_MODEL_PATH")
FK_DEVICE = os.getenv("FK_DEVICE", "cpu")
FK_DTYPE = os.getenv("FK_DTYPE", "float32")

CHECKS_PY = _split_env("CHECKS_PY")
CHECKS_TS = _split_env("CHECKS_TS")
CHECKS_EXTRA = _split_env("CHECKS_EXTRA")

DEBUG_MODE = _bool_env("FK_DEBUG", False)
AUTONOMY_MODE = _bool_env("FK_AUTONOMY_MODE", False)
RUN_COMMIT_CHECKS = _bool_env("FK_RUN_COMMIT_CHECKS", True)
ENABLE_OUTBOX = _bool_env("FK_ENABLE_OUTBOX", False)
AUTO_PUSH = _bool_env("FK_AUTO_PUSH", False)
AUTO_MERGE = _bool_env("FK_AUTO_MERGE", False)
ROADMAP_AUTO_PUSH = _bool_env("FK_ROADMAP_AUTO_PUSH", False)
ROADMAP_COMMIT_INTERVAL = int(os.getenv("FK_ROADMAP_COMMIT_INTERVAL", "0"))
ENABLE_RECURSIVE_FIX = _bool_env("FK_ENABLE_RECURSIVE_FIX", False)
GITHUB_TOKEN_ENV_KEYS = ["GITHUB_TOKEN", "GH_TOKEN"]
PR_BASE = os.getenv("FK_PR_BASE", "main")

FK_CORE_API_BASE = os.getenv("FK_CORE_API_BASE", "http://localhost:8000")
TRITON_MODEL_CORE = os.getenv("TRITON_MODEL_CORE", os.getenv("TRITON_MODEL", ""))
TRITON_CHECKPOINT = os.getenv("TRITON_CHECKPOINT")

CONFIG_DIR = Path(os.getenv("FK_CONFIG_DIR", ".forgekeeper"))

__all__ = [name for name in list(globals()) if name.isupper()]
