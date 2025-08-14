"""Local OpenAI Harmony conversation model service.

This module integrates the `openai-harmony` library for prompt
construction while executing the model locally via `llama_cpp`.
The model path is supplied through the ``OPENAI_MODEL_PATH``
environment variable and loaded on first use.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Tuple

try:  # pragma: no cover - optional dependency
    from llama_cpp import Llama
except Exception:  # pragma: no cover - allow import without llama_cpp installed
    Llama = None  # type: ignore

from openai_harmony import (
    Conversation,
    Message,
    Role,
    SystemContent,
    DeveloperContent,
    load_harmony_encoding,
    HarmonyEncodingName,
    ReasoningEffort,
)

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt
from forgekeeper.app.utils.harmony_parser import parse_harmony_tool_call

log = get_logger(__name__, debug=DEBUG_MODE)

# Environment configuration -------------------------------------------------
MODEL_PATH = os.getenv("OPENAI_MODEL_PATH")
N_CTX = int(os.getenv("LLM_CONTEXT_SIZE", "4096"))
N_THREADS = int(os.getenv("LLM_THREADS", "8"))
N_GPU_LAYERS = int(os.getenv("LLM_GPU_LAYERS", "0"))
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "500"))
TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.7"))
TOP_P = float(os.getenv("LLM_TOP_P", "0.95"))
DEFAULT_REASONING = os.getenv("OPENAI_REASONING_EFFORT", "medium")

# Loading the encoding may require downloading a vocab file.  In constrained
# environments this can fail, so perform it lazily and fall back to ``None`` to
# allow tests to patch the encoding or skip Harmony-specific features.
try:  # pragma: no cover - optional download
    ENCODING = load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS)
except Exception as exc:  # pragma: no cover - defensive logging
    log.warning("Failed to load Harmony encoding: %s", exc)
    ENCODING = None

_llm: Llama | None = None


def _load_model() -> Llama:
    """Load and cache the local Harmony model."""

    global _llm
    if _llm is None:
        if Llama is None:
            raise RuntimeError("llama_cpp is required for Harmony local models")
        if not MODEL_PATH:
            raise RuntimeError("OPENAI_MODEL_PATH is not set")

        log.info("Loading Harmony model from %s", MODEL_PATH)
        _llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            n_gpu_layers=N_GPU_LAYERS,
            verbose=False,
        )
    return _llm


# Harmony prompt helpers ----------------------------------------------------
def _extract_directives(text: str) -> Tuple[Dict[str, str], str]:
    """Extract generation directives like ``Reasoning: high`` from ``text``."""

    directives: Dict[str, str] = {}
    lines = []
    pattern = re.compile(r"^(\w+):\s*(.+)$", re.IGNORECASE)
    for line in text.splitlines():
        match = pattern.match(line.strip())
        if match:
            key, value = match.group(1).lower(), match.group(2).strip()
            directives[key] = value
        else:
            lines.append(line)
    return directives, "\n".join(lines).strip()


def _build_conversation(
    prompt: str,
    system_message: str | None,
    reasoning: str,
) -> Conversation:
    """Construct a Harmony ``Conversation`` with optional system/developer messages."""

    messages: List[Message] = []

    # System message with reasoning effort
    reason_enum = ReasoningEffort[reasoning.upper()]
    system_content = SystemContent(reasoning_effort=reason_enum)
    messages.append(Message.from_role_and_content(Role.SYSTEM, system_content))

    # Developer instructions
    if system_message:
        messages.append(
            Message.from_role_and_content(
                Role.DEVELOPER, DeveloperContent(instructions=system_message)
            )
        )

    messages.append(Message.from_role_and_content(Role.USER, prompt))
    return Conversation.from_messages(messages)


def _render_conversation(convo: Conversation) -> Tuple[str, List[str]]:
    """Render conversation to text and stop sequences using Harmony encoding."""

    if ENCODING is None:
        raise RuntimeError("Harmony encoding is not available")

    tokens = ENCODING.render_conversation_for_completion(convo, Role.ASSISTANT)
    prompt_text = ENCODING.decode_utf8(tokens)

    stop_tokens = ENCODING.stop_tokens_for_assistant_actions()
    stop_sequences = [ENCODING.decode_utf8([t]) for t in stop_tokens]
    return prompt_text, stop_sequences


def ask_llm(
    prompt: str,
    system_message: str | None = None,
    reasoning: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> Any:
    """Ask the local Harmony model a question.

    ``reasoning``, ``temperature``, ``top_p`` and ``max_tokens`` may be provided
    directly, via environment variables, or embedded as ``Key: Value`` directives
    at the top of ``prompt`` or ``system_message``.
    """

    prompt = verify_prompt(prompt)

    dir_prompt, prompt = _extract_directives(prompt)
    dir_system, system_message = (
        _extract_directives(system_message) if system_message else ({}, None)
    )

    # Resolve generation settings
    reasoning = (
        reasoning
        or dir_prompt.get("reasoning")
        or dir_system.get("reasoning")
        or DEFAULT_REASONING
    )

    temperature = float(
        dir_prompt.get("temperature")
        or dir_system.get("temperature")
        or (temperature if temperature is not None else TEMPERATURE)
    )
    top_p = float(
        dir_prompt.get("top_p")
        or dir_system.get("top_p")
        or (top_p if top_p is not None else TOP_P)
    )
    max_tokens = int(
        dir_prompt.get("max_tokens")
        or dir_system.get("max_tokens")
        or (max_tokens if max_tokens is not None else MAX_TOKENS)
    )

    convo = _build_conversation(prompt, system_message, reasoning)
    rendered, stop = _render_conversation(convo)

    llm = _load_model()
    try:
        output = llm(
            rendered,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stop=stop,
        )
        text = output["choices"][0]["text"].strip()
        tool = parse_harmony_tool_call(text)
        if tool:
            return {"function_call": tool}
        return text
    except Exception as exc:  # pragma: no cover - defensive logging
        log.error("Harmony model inference failed: %s", exc)
        return ""


__all__ = ["ask_llm"]

