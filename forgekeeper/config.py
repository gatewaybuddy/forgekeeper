import os

DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"
"""Global debug flag used across the project."""

RUN_COMMIT_CHECKS = os.getenv("RUN_COMMIT_CHECKS", "true").lower() == "true"
"""Whether to run commit checks before committing changes."""

_checks_py = os.getenv("CHECKS_PY")
if _checks_py:
    CHECKS_PY = [cmd.strip() for cmd in _checks_py.split(",") if cmd.strip()]
else:
    CHECKS_PY = ["ruff .", "mypy .", "pytest -q"]
"""Commands executed for Python checks."""

_checks_ts = os.getenv("CHECKS_TS")
if _checks_ts:
    CHECKS_TS = [cmd.strip() for cmd in _checks_ts.split(",") if cmd.strip()]
else:
    CHECKS_TS = [
        "npm --prefix backend ci",
        "npm --prefix backend run build",
        "npm --prefix frontend ci",
        "npm --prefix frontend run build",
    ]
"""Commands executed for TypeScript checks."""

COMMIT_CHECKS = CHECKS_PY + CHECKS_TS
"""Combined commit check commands."""

CODEGEN_MODEL = os.getenv("CODEGEN_MODEL", "gpt-4o-mini")
"""Model used for code generation."""

CODEGEN_MAX_TOKENS = int(os.getenv("CODEGEN_MAX_TOKENS", "4096"))
"""Maximum number of tokens allowed for code generation."""

CODEGEN_TEMPERATURE = float(os.getenv("CODEGEN_TEMPERATURE", "0.0"))
"""Sampling temperature for code generation."""

ENABLE_RECURSIVE_FIX = os.getenv("ENABLE_RECURSIVE_FIX", "true").lower() == "true"
"""Enable iterative recursive fix attempts."""

_token_keys = os.getenv("GITHUB_TOKEN_ENV_KEYS")
if _token_keys:
    GITHUB_TOKEN_ENV_KEYS = [k.strip() for k in _token_keys.split(",") if k.strip()]
else:
    GITHUB_TOKEN_ENV_KEYS = ["GH_TOKEN", "GITHUB_TOKEN"]
"""Environment variables inspected for a GitHub token."""

