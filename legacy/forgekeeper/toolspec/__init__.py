"""Tool registry utilities for Forgekeeper."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Mapping


Handler = Callable[[Mapping[str, Any]], Mapping[str, Any]]


@dataclass(slots=True)
class ToolRecord:
    namespace: str
    name: str
    description: str
    input_schema: Mapping[str, Any]
    handler: Handler


class ToolRegistry:
    """Minimal tool registry used in unit tests and CLI integration."""

    def __init__(self) -> None:
        self._tools: "OrderedDict[str, ToolRecord]" = OrderedDict()

    def register_tool(
        self,
        *,
        namespace: str,
        name: str,
        description: str,
        input_schema: Mapping[str, Any],
        handler: Handler,
    ) -> None:
        key = f"{namespace}.{name}"
        self._tools[key] = ToolRecord(namespace, name, description, input_schema, handler)

    def list_tools(self) -> list[ToolRecord]:
        return list(self._tools.values())

    def get(self, fullname: str) -> ToolRecord:
        return self._tools[fullname]

    def invoke(self, fullname: str, params: Mapping[str, Any]) -> Mapping[str, Any]:
        record = self.get(fullname)
        return record.handler(params)


__all__ = ["ToolRegistry", "ToolRecord", "Handler"]

