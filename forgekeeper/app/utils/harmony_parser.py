"""Utilities for parsing Harmony tool/action calls."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

# Regex to capture Harmony tool calls, e.g.:
# <|start|>assistant<|channel|>commentary to=functions.write_file<|constrain|>json<|message|>{"path": "file", "content": "hi"}<|call|>
_HARMONY_TOOL_RE = re.compile(
    r"to=functions\.([\w\.]+).*?<\|message\|>(\{.*?\})<\|call\|>",
    re.DOTALL,
)

def parse_harmony_tool_call(text: str) -> Optional[Dict[str, Any]]:
    """Return tool call details if ``text`` contains a Harmony action."""
    match = _HARMONY_TOOL_RE.search(text)
    if not match:
        return None
    name = match.group(1)
    arg_src = match.group(2)
    try:
        arguments = json.loads(arg_src)
    except Exception:
        arguments = {}
    return {"name": name, "arguments": arguments}

__all__ = ["parse_harmony_tool_call"]
