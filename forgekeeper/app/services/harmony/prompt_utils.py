"""Prompt utilities for Harmony service."""

from __future__ import annotations

import re
from typing import Dict, Tuple, List

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)

try:  # pragma: no cover - optional dependency
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
except Exception:  # pragma: no cover - allow import without openai_harmony
    Conversation = Message = Role = SystemContent = DeveloperContent = load_harmony_encoding = HarmonyEncodingName = ReasoningEffort = None  # type: ignore

ENCODING = None
if load_harmony_encoding and HarmonyEncodingName:
    try:  # pragma: no cover - optional download
        ENCODING = load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS)
    except Exception as exc:  # pragma: no cover - defensive logging
        log.warning("Failed to load Harmony encoding: %s", exc)


def extract_directives(text: str) -> Tuple[Dict[str, str], str]:
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


def build_conversation(prompt: str, system_message: str | None, reasoning: str) -> "Conversation":
    """Construct a Harmony Conversation with optional system/developer messages."""
    if Conversation is None:
        raise RuntimeError("openai_harmony is required for Harmony conversations")

    messages: List[Message] = []
    reason_enum = ReasoningEffort[reasoning.upper()]
    system_content = SystemContent(reasoning_effort=reason_enum)
    messages.append(Message.from_role_and_content(Role.SYSTEM, system_content))

    if system_message:
        messages.append(
            Message.from_role_and_content(
                Role.DEVELOPER, DeveloperContent(instructions=system_message)
            )
        )

    messages.append(Message.from_role_and_content(Role.USER, prompt))
    return Conversation.from_messages(messages)


def render_conversation(convo: "Conversation") -> Tuple[str, List[str]]:
    """Render conversation to text and stop sequences using Harmony encoding."""
    if ENCODING is None:
        raise RuntimeError("Harmony encoding is not available")

    tokens = ENCODING.render_conversation_for_completion(convo, Role.ASSISTANT)
    prompt_text = ENCODING.decode_utf8(tokens)

    stop_tokens = ENCODING.stop_tokens_for_assistant_actions()
    stop_sequences = [ENCODING.decode_utf8([t]) for t in stop_tokens]
    return prompt_text, stop_sequences


__all__ = [
    "extract_directives",
    "build_conversation",
    "render_conversation",
    "ENCODING",
]
