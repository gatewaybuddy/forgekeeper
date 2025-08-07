"""Local OpenAI Harmony conversation model service.

This module integrates the `openai-harmony` library for prompt
construction while executing the model locally via `llama_cpp`.
The model path is supplied through the ``OPENAI_MODEL_PATH``
environment variable and loaded on first use.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

try:  # pragma: no cover - optional dependency
    from llama_cpp import Llama
except Exception:  # pragma: no cover - allow import without llama_cpp installed
    Llama = None  # type: ignore

from openai_harmony import Conversation, Message, Role

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt

log = get_logger(__name__, debug=DEBUG_MODE)

# Environment configuration -------------------------------------------------
MODEL_PATH = os.getenv("OPENAI_MODEL_PATH")
N_CTX = int(os.getenv("LLM_CONTEXT_SIZE", "4096"))
N_THREADS = int(os.getenv("LLM_THREADS", "8"))
N_GPU_LAYERS = int(os.getenv("LLM_GPU_LAYERS", "0"))
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "500"))

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
def _build_harmony_messages(
    prompt: str, system_message: str | None = None
) -> List[Dict[str, Any]]:
    """Construct a Harmony conversation payload."""

    messages: List[Message] = []
    if system_message:
        messages.append(Message.from_role_and_content(Role.DEVELOPER, system_message))
    messages.append(Message.from_role_and_content(Role.USER, prompt))

    convo = Conversation.from_messages(messages)
    formatted: List[Dict[str, Any]] = []

    for msg in convo.messages:
        content_items = []
        for c in msg.content:
            data = c.model_dump()
            content_items.append({"type": "text", "text": data.get("text", "")})

        msg_dict: Dict[str, Any] = {
            "role": msg.author.role.value,
            "content": content_items,
        }

        if msg.channel:
            msg_dict["channel"] = msg.channel
        if msg.recipient:
            msg_dict["recipient"] = msg.recipient

        formatted.append(msg_dict)

    return formatted


def _render_prompt(messages: List[Dict[str, Any]]) -> str:
    """Render Harmony message dicts into a plain text prompt."""

    lines: List[str] = []
    for msg in messages:
        role = msg.get("role")
        text = " ".join(item.get("text", "") for item in msg.get("content", []))
        if role == "developer":
            lines.append(f"[SYSTEM] {text}")
        elif role == "user":
            lines.append(f"[USER] {text}")
    lines.append("[ASSISTANT]")
    return "\n".join(lines)


def ask_llm(prompt: str, system_message: str | None = None) -> str:
    """Ask the local Harmony model a question."""

    prompt = verify_prompt(prompt)
    messages = _build_harmony_messages(prompt, system_message)
    rendered = _render_prompt(messages)

    llm = _load_model()
    try:
        output = llm(rendered, max_tokens=MAX_TOKENS, stop=["</s>", "<|eot_id|>"])
        return output["choices"][0]["text"].strip()
    except Exception as exc:  # pragma: no cover - defensive logging
        log.error("Harmony model inference failed: %s", exc)
        return ""


__all__ = ["ask_llm"]

