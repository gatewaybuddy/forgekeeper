"""vLLM backend service using OpenAI-compatible chat API."""

from __future__ import annotations

from typing import Any, Iterable

from forgekeeper.llm.clients import openai_compat_client
from forgekeeper.app.utils.prompt_guard import verify_prompt
from forgekeeper.app.utils.json_helpers import extract_json


def ask_llm(prompt: str, **kwargs: Any):
    """Send ``prompt`` to the vLLM backend and return parsed JSON response.

    Parameters
    ----------
    prompt:
        User prompt to send to the model.
    **kwargs:
        Additional parameters forwarded to :func:`openai_compat_client.chat`.

    Returns
    -------
    dict | str
        Parsed JSON object from the model response, or raw text if JSON cannot
        be extracted.
    """
    prompt = verify_prompt(prompt)
    messages = [{"role": "user", "content": prompt}]
    result: str | Iterable[str] = openai_compat_client.chat("core", messages, **kwargs)
    if isinstance(result, str):
        text = result
    else:
        text = "".join(result)
    return extract_json(text)


__all__ = ["ask_llm"]
