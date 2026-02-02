"""Environment and configuration management for Forgekeeper CLI."""

from __future__ import annotations

import os
from pathlib import Path


def load_dotenv(env_path: Path | None = None) -> None:
    """Load .env file into os.environ if it exists.

    Args:
        env_path: Path to .env file. If None, uses repository root .env
    """
    if env_path is None:
        # Default to repository root
        env_path = Path(__file__).resolve().parents[2] / ".env"

    if not env_path.exists():
        return

    try:
        for line in env_path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                # Only set if not already in environment (env vars take precedence)
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception:
        # Silently fail - dotenv is optional
        pass


def get_repo_root() -> Path:
    """Get the repository root directory.

    Returns:
        Path to repository root (parent of forgekeeper package)
    """
    return Path(__file__).resolve().parents[2]


def get_core_kind() -> str:
    """Get the configured inference core type.

    Returns:
        'llama' or 'vllm' (default: 'llama')
    """
    return os.getenv("FK_CORE_KIND", "llama").strip().lower()


def get_core_api_base() -> str:
    """Get the configured core API base URL.

    Returns:
        API base URL for the configured core
    """
    kind = get_core_kind()
    default = "http://llama-core:8000" if kind == "llama" else "http://vllm-core:8000"
    return os.getenv("FK_CORE_API_BASE", default).strip()


__all__ = [
    "load_dotenv",
    "get_repo_root",
    "get_core_kind",
    "get_core_api_base",
]
