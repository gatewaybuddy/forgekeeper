"""Harmony service entry point."""

from __future__ import annotations

from typing import Any

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt
from forgekeeper.app.utils.harmony_parser import parse_harmony_tool_call

from .config import (
    _load_model,
    MAX_TOKENS,
    TEMPERATURE,
    TOP_P,
    DEFAULT_REASONING,
)
from .prompt_utils import (
    extract_directives,
    build_conversation,
    render_conversation,
)

log = get_logger(__name__, debug=DEBUG_MODE)


def ask_llm(
    prompt: str,
    system_message: str | None = None,
    reasoning: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> Any:
    """Ask the local Harmony model a question."""
    prompt = verify_prompt(prompt)

    dir_prompt, prompt = extract_directives(prompt)
    dir_system, system_message = (
        extract_directives(system_message) if system_message else ({}, None)
    )

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

    convo = build_conversation(prompt, system_message, reasoning)
    rendered, stop = render_conversation(convo)

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
