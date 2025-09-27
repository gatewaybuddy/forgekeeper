from __future__ import annotations

import json
import os
from typing import Dict

if os.getenv("FK_LLM_IMPL", "vllm").lower() == "triton":
    from forgekeeper.llm.llm_service_triton import llm_core
else:
    from forgekeeper.llm.llm_service_vllm import llm_core

from . import generator

_last_summary: Dict[str, str] = {"summary": "", "emotion": "neutral"}


def reflect_recent_thoughts() -> str:
    """Generate a reflection on recent thoughts."""
    prompt = (
        "Self-reflection: Review recent thoughts for alignment with goals.\n"
        "Recent thoughts:\n" + "\n".join(generator._thought_history[-5:])
    )
    try:
        return llm_core.ask(prompt)
    except Exception as exc:  # pragma: no cover - defensive
        return f"Reflection error: {exc}"


def summarize_thoughts() -> Dict[str, str]:
    """Condense recent thoughts and tag the dominant emotion."""
    global _last_summary
    if not generator._thought_history:
        return _last_summary
    recent = generator._thought_history[-10:]
    prompt = (
        "Summarize the following thoughts and classify the dominant emotion "
        "as one of [neutral, positive, negative, curious, frustrated].\n"
        + "\n".join(recent)
    )
    try:
        response = llm_core.ask(prompt)
        data = json.loads(response)
        summary = data.get("summary", "")
        emotion = data.get("emotion", "neutral")
    except Exception as exc:  # pragma: no cover - defensive
        summary = f"Summary error: {exc}"
        emotion = "neutral"
    generator._thought_history.clear()
    generator._thought_history.append(summary)
    generator._append_thought(summary)
    _last_summary = {"summary": summary, "emotion": emotion}
    return _last_summary


def get_last_summary() -> Dict[str, str]:
    """Return the most recent summary and emotion tag."""
    return _last_summary
