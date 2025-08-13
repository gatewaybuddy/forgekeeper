"""Utility helpers for OpenAI-style tool calling."""

from __future__ import annotations

import inspect
import json
from typing import Any, Dict, List

from forgekeeper.app.services.function_loader import load_functions

# Load available functions at module import time for simplicity.
_FUNCTIONS: Dict[str, Any] = load_functions()


def build_tool_specs() -> List[Dict[str, Any]]:
    """Return OpenAI-compatible tool specification objects."""
    tools: List[Dict[str, Any]] = []
    for name, func in _FUNCTIONS.items():
        sig = inspect.signature(func)
        props: Dict[str, Any] = {}
        required: List[str] = []
        for param_name, param in sig.parameters.items():
            props[param_name] = {"type": "string"}
            if param.default is inspect._empty:
                required.append(param_name)
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": func.__doc__ or "",
                    "parameters": {
                        "type": "object",
                        "properties": props,
                        "required": required,
                    },
                },
            }
        )
    return tools


def execute_tool_call(call: Dict[str, Any]) -> str:
    """Execute a single tool call and return the result as a string."""
    name = call.get("function", {}).get("name")
    if not name or name not in _FUNCTIONS:
        return f"Unknown tool: {name}"
    func = _FUNCTIONS[name]
    arg_str = call["function"].get("arguments", "{}")
    try:
        args = json.loads(arg_str) if isinstance(arg_str, str) else arg_str
    except Exception as exc:  # pragma: no cover - defensive
        return f"Invalid arguments for {name}: {exc}"
    try:
        result = func(**args)
    except Exception as exc:  # pragma: no cover - defensive
        result = f"Error executing {name}: {exc}"
    return str(result)


__all__ = ["build_tool_specs", "execute_tool_call"]
