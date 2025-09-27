"""Utilities for rendering prompts that follow the Harmony protocol."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, Iterable, List, Mapping


DEFAULT_KNOWLEDGE_CUTOFF = "2024-06"
DEFAULT_REASONING = "high"
DEFAULT_CHANNELS = ("analysis", "commentary", "final")


@dataclass(slots=True)
class HarmonyConfig:
    """Configuration for rendering Harmony prompts.

    Attributes:
        include_default_system: Whether to prepend the recommended default
            system message if one is not already supplied.
        knowledge_cutoff: The knowledge cutoff date to report in the system
            message.
        current_date: The current date that should be surfaced to the model.
        reasoning_effort: Desired reasoning effort to request from the model.
        valid_channels: Ordered iterable of channels the assistant may use.
        tool_channel_note: Optional note reminding the model that tool calls
            must target the ``commentary`` channel.
        append_assistant_start: Whether to append ``<|start|>assistant`` to the
            rendered prompt so that the model knows to begin responding.
    """

    include_default_system: bool = True
    knowledge_cutoff: str = DEFAULT_KNOWLEDGE_CUTOFF
    current_date: str | None = None
    reasoning_effort: str = DEFAULT_REASONING
    valid_channels: Iterable[str] = DEFAULT_CHANNELS
    tool_channel_note: str | None = None
    append_assistant_start: bool = True


def _normalise_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, Mapping):
        return content.get("text", "")
    if isinstance(content, Iterable):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, Mapping):
                text = item.get("text")
                if text:
                    parts.append(str(text))
        return "".join(parts)
    return str(content)


def _format_header(message: Mapping[str, Any]) -> str:
    role = message.get("role", "assistant")
    header = f"<|start|>{role}"
    channel = message.get("channel")
    if channel:
        header += f"<|channel|>{channel}"
    recipient = message.get("recipient")
    if recipient:
        header += f" to={recipient}"
    constrain = message.get("constrain")
    if constrain:
        header += f" <|constrain|>{constrain}"
    return header


def _render_message(message: Mapping[str, Any]) -> str:
    body = _normalise_content(message.get("content", ""))
    terminator = message.get("terminator", "<|end|>")
    return f"{_format_header(message)}<|message|>{body}{terminator}"


def _ensure_system_message(messages: Iterable[Mapping[str, Any]], config: HarmonyConfig) -> List[Mapping[str, Any]]:
    messages_list = list(messages)
    if not config.include_default_system:
        return messages_list
    if messages_list and messages_list[0].get("role") == "system":
        return messages_list

    today = config.current_date or date.today().isoformat()
    valid_channels = ", ".join(config.valid_channels)
    base_content = (
        "You are ChatGPT, a large language model trained by OpenAI.\n\n"
        f"Knowledge cutoff: {config.knowledge_cutoff}\n\n"
        f"Current date: {today}\n\n\n"
        f"Reasoning: {config.reasoning_effort}\n\n\n"
        f"# Valid channels: {valid_channels}. Channel must be included for every message."
    )
    if config.tool_channel_note:
        base_content += f"\n\nCalls to these tools must go to the commentary channel: '{config.tool_channel_note}'."

    system_message: Dict[str, Any] = {"role": "system", "content": base_content}
    return [system_message, *messages_list]


def render_harmony(messages: Iterable[Mapping[str, Any]], config: HarmonyConfig | None = None) -> str:
    """Render a sequence of conversation messages in Harmony format."""

    harmony_config = config or HarmonyConfig()
    normalised_messages = _ensure_system_message(messages, harmony_config)
    rendered = [
        _render_message(message)
        for message in normalised_messages
    ]

    if harmony_config.append_assistant_start:
        rendered.append("<|start|>assistant")

    return "".join(rendered)


__all__ = ["HarmonyConfig", "render_harmony"]
