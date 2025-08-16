import os

DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"
"""Global debug flag used across the project."""

RUN_COMMIT_CHECKS = os.getenv("RUN_COMMIT_CHECKS", "true").lower() == "true"
"""Whether to run commit checks before committing changes."""

AUTONOMY_MODE = os.getenv("AUTONOMY_MODE", "false").lower() == "true"
"""Enable fully autonomous task execution."""

ENABLE_OUTBOX = os.getenv("ENABLE_OUTBOX", "true").lower() == "true"
"""Persist tool actions to an outbox and replay them on restart."""

ROADMAP_COMMIT_INTERVAL = int(os.getenv("ROADMAP_COMMIT_INTERVAL", "3600"))
"""Seconds between automatic roadmap commits."""

ROADMAP_AUTO_PUSH = os.getenv("ROADMAP_AUTO_PUSH", "false").lower() == "true"
"""Whether periodic roadmap commits should be pushed automatically."""

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

LLM_BACKEND = os.getenv("LLM_BACKEND", "vllm")
"""Backend implementation to use for LLMs."""

VLLM_MODEL_CORE = os.getenv("VLLM_MODEL_CORE", "mistral-nemo-instruct")
"""Model identifier for the core agent when using vLLM."""

VLLM_MODEL_CODER = os.getenv("VLLM_MODEL_CODER", "codellama-13b-python")
"""Model identifier for the coder agent when using vLLM."""

VLLM_HOST_CORE = os.getenv("VLLM_HOST_CORE", "localhost")
"""Hostname for the core vLLM server."""

VLLM_PORT_CORE = int(os.getenv("VLLM_PORT_CORE", "8000"))
"""Port for the core vLLM server."""

VLLM_HOST_CODER = os.getenv("VLLM_HOST_CODER", "localhost")
"""Hostname for the coder vLLM server."""

VLLM_PORT_CODER = int(os.getenv("VLLM_PORT_CODER", "8001"))
"""Port for the coder vLLM server."""

VLLM_MAX_MODEL_LEN = int(os.getenv("VLLM_MAX_MODEL_LEN", "4096"))
"""Maximum sequence length supported by the vLLM models."""

VLLM_TP = int(os.getenv("VLLM_TP", "1"))
"""Tensor parallelism degree for vLLM."""

VLLM_GPU_MEMORY_UTILIZATION = float(
    os.getenv("VLLM_GPU_MEMORY_UTILIZATION", "0.9")
)
"""Fraction of GPU memory vLLM may allocate."""

VLLM_ENABLE_LOGPROBS = os.getenv("VLLM_ENABLE_LOGPROBS", "false").lower() == "true"
"""Whether vLLM should return log probabilities."""

_token_keys = os.getenv("GITHUB_TOKEN_ENV_KEYS")
if _token_keys:
    GITHUB_TOKEN_ENV_KEYS = [k.strip() for k in _token_keys.split(",") if k.strip()]
else:
    GITHUB_TOKEN_ENV_KEYS = ["GH_TOKEN", "GITHUB_TOKEN"]
"""Environment variables inspected for a GitHub token."""

