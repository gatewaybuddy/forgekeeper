"""Harmony tool usage helpers."""

from __future__ import annotations

import json
import textwrap
from dataclasses import dataclass, field
from typing import Any, List, Mapping, MutableMapping, Sequence


def _schema_to_typescript(schema: Mapping[str, Any] | None) -> str:
    """Convert a JSON schema mapping into a TypeScript type expression."""

    if not schema:
        return "Record<string, unknown>"

    if "$ref" in schema:  # pragma: no cover - placeholder for future expansion
        return "unknown"

    schema_type = schema.get("type")

    if schema_type is None:
        if "enum" in schema:
            return " | ".join(json.dumps(value) for value in schema["enum"])
        if "anyOf" in schema:
            return " | ".join(_schema_to_typescript(item) for item in schema["anyOf"])
        if "oneOf" in schema:
            return " | ".join(_schema_to_typescript(item) for item in schema["oneOf"])
        if "allOf" in schema:
            return " & ".join(_schema_to_typescript(item) for item in schema["allOf"])
        return "unknown"

    if isinstance(schema_type, list):
        return " | ".join(sorted({_schema_to_typescript({"type": t, **schema}) for t in schema_type}))

    if schema_type == "object":
        props: Mapping[str, Mapping[str, Any]] = schema.get("properties", {})  # type: ignore[assignment]
        required = set(schema.get("required", []))
        entries: List[str] = []
        for name, prop_schema in props.items():
            ts_type = _schema_to_typescript(prop_schema)
            optional = "" if name in required else "?"
            prop_comment = prop_schema.get("description")
            if prop_comment:
                comment_lines = [f"  // {line}" for line in prop_comment.splitlines()]
                entries.extend(comment_lines)
            entries.append(f"  {name}{optional}: {ts_type};")

        additional = schema.get("additionalProperties")
        if isinstance(additional, Mapping):
            entries.append(f"  [key: string]: {_schema_to_typescript(additional)};")
        elif additional:
            entries.append("  [key: string]: unknown;")

        if not entries:
            return "Record<string, unknown>"

        return "{\n" + "\n".join(entries) + "\n}"

    if schema_type == "array":
        items_schema = schema.get("items") if isinstance(schema.get("items"), Mapping) else None
        return f"Array<{_schema_to_typescript(items_schema)}>"

    if schema_type == "string":
        if "enum" in schema:
            return " | ".join(json.dumps(value) for value in schema["enum"])
        if schema.get("format") == "uri":
            return "URL | string"
        return "string"

    if schema_type == "integer":
        return "number"

    if schema_type == "number":
        return "number"

    if schema_type == "boolean":
        return "boolean"

    if schema_type == "null":
        return "null"

    return "unknown"


def _render_comment_block(text: str | None, indent: str = "  ") -> str:
    if not text:
        return ""
    lines = ["/**"]
    for line in text.splitlines():
        lines.append(f" * {line.strip()}")
    lines.append(" */")
    return textwrap.indent("\n".join(lines), indent)


@dataclass(slots=True)
class ToolDefinition:
    """Represents a tool exposed to the model via Harmony developer messages."""

    name: str
    description: str
    input_schema: Mapping[str, Any] | None = None
    namespace: str = "functions"
    output_schema: Mapping[str, Any] | None = None
    metadata: Mapping[str, Any] | None = None

    def to_typescript_definition(self) -> str:
        """Render this tool as a TypeScript function signature."""

        args_type = _schema_to_typescript(self.input_schema)
        return_type = _schema_to_typescript(self.output_schema) if self.output_schema else "Promise<unknown>"
        comment = _render_comment_block(self.description, indent="  ")
        signature = f"type {self.name} = (_: {args_type}) => {return_type};"
        if comment:
            return f"{comment}\n  {signature}"
        return f"  {signature}"

    def to_mcp_tool(self) -> Mapping[str, Any]:
        """Serialize into an MCP-compatible tool descriptor."""

        payload: MutableMapping[str, Any] = {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema or {"type": "object", "properties": {}},
        }
        if self.output_schema:
            payload["output_schema"] = self.output_schema
        if self.metadata:
            payload["metadata"] = self.metadata
        if self.namespace and self.namespace != "functions":
            payload["namespace"] = self.namespace
        return payload

    @classmethod
    def from_mcp(cls, payload: Mapping[str, Any], *, default_namespace: str = "functions") -> "ToolDefinition":
        """Create a :class:`ToolDefinition` from an MCP tool descriptor."""

        namespace = payload.get("namespace") or default_namespace
        return cls(
            name=str(payload.get("name")),
            description=str(payload.get("description", "")),
            input_schema=payload.get("input_schema"),
            namespace=namespace,
            output_schema=payload.get("output_schema"),
            metadata=payload.get("metadata"),
        )


def render_tool_developer_message(tools: Sequence[ToolDefinition], *, include_guardrails: bool = True) -> Mapping[str, Any]:
    """Build the developer message that advertises tool availability with optional guardrail guidance.

    Args:
        tools: Sequence of tool definitions to advertise
        include_guardrails: If True, include tool guardrail and best practices guidance

    Returns:
        Developer message dict with role, channel, and content
    """

    if not tools:
        return {"role": "developer", "channel": "commentary", "content": "# Tools\n\n// No tools registered."}

    lines: List[str] = []

    # Add guardrails section if requested
    if include_guardrails:
        lines.extend([
            "# Tool System with Guardrails",
            "",
            "## TOOL SYSTEM GUARDRAILS",
            "",
            "1. **ALLOWLIST**: Only 19 curated tools are available:",
            "   - echo, get_time, read_dir, read_file, write_file, write_repo_file",
            "   - http_fetch, git_status, git_diff, git_add, git_commit, git_push, git_pull",
            "   - run_bash, run_powershell, refresh_tools, restart_frontend",
            "   - create_task_card, check_pr_status",
            "",
            "2. **VALIDATION**: All tool arguments are validated against schemas",
            "   - Required arguments must be present",
            "   - Type checking enforced (string, number, boolean, array, object)",
            "   - Length limits enforced (strings, arrays)",
            "   - Enum validation for restricted values",
            "",
            "3. **EXECUTION LIMITS**:",
            "   - Timeout: 30 seconds per tool call",
            "   - Output: 1MB maximum size",
            "   - Rate limit: 100 requests burst, 10 per second sustained",
            "",
            "4. **SECURITY**:",
            "   - Sensitive data (API keys, emails, paths) redacted in logs",
            "   - Logs show <redacted:*> but tools receive real data",
            "   - All executions logged to ContextLog with correlation IDs",
            "",
            "5. **ERROR HANDLING**:",
            "   - Tool not in allowlist: Returns error with list of allowed tools",
            "   - Invalid arguments: Returns validation error with details",
            "   - Timeout: Returns timeout error after 30s",
            "   - Rate limit: Returns 429 with retry-after header",
            "",
            "## TOOL USAGE BEST PRACTICES",
            "",
            "**When to use tools:**",
            "- Use tools when you need real-time information (time, file contents, git status)",
            "- Use tools when you need to perform actions (write files, run commands, create PRs)",
            "- Use tools when you need external data (HTTP requests)",
            "",
            "**When NOT to use tools:**",
            "- Don't use tools for information you already have in context",
            "- Don't use tools for simple calculations or reasoning",
            "- Don't repeatedly call tools with same arguments (results are likely same)",
            "",
            "**Error recovery:**",
            "- If tool returns allowlist error: Check available tools and choose one from list",
            "- If tool returns validation error: Fix arguments based on error message",
            "- If tool times out: Try with smaller scope or simpler operation",
            "- If rate limited: Wait for retry-after seconds before trying again",
            "",
            "## AVAILABLE TOOLS",
            "",
        ])
    else:
        lines.extend(["# Tools", ""])

    # Add tool definitions grouped by namespace
    current_namespace: str | None = None
    for tool in tools:
        namespace = tool.namespace or "functions"
        if namespace != current_namespace:
            if current_namespace is not None:
                lines.append("}")
                lines.append("")
            lines.append(f"namespace {namespace} {{")
            current_namespace = namespace
        lines.append(tool.to_typescript_definition())
    if current_namespace is not None:
        lines.append("}")

    content = "\n".join(lines)
    return {"role": "developer", "channel": "commentary", "content": content}


@dataclass(slots=True)
class HarmonyToolCall:
    """Structured representation of a Harmony tool call."""

    id: str
    name: str
    namespace: str
    arguments: Mapping[str, Any]
    raw_arguments: str | None = None
    type: str | None = None
    raw: Mapping[str, Any] = field(default_factory=dict)
    error: str | None = None

    @property
    def qualified_name(self) -> str:
        return f"{self.namespace}.{self.name}" if self.namespace else self.name

    def to_mcp_invocation(self) -> Mapping[str, Any]:
        """Convert to a generic MCP tool invocation payload."""

        payload: MutableMapping[str, Any] = {
            "name": self.name,
            "arguments": self.arguments,
            "call_id": self.id,
        }
        if self.namespace:
            payload["namespace"] = self.namespace
        if self.error:
            payload["error"] = self.error
        if self.type:
            payload["type"] = self.type
        return payload


def _extract_name(raw: Mapping[str, Any], default_namespace: str) -> tuple[str, str]:
    """Derive namespace and tool name from a raw Harmony tool call payload."""

    candidate = (
        raw.get("name")
        or raw.get("tool_name")
        or raw.get("function", {}).get("name")
        or raw.get("recipient")
        or ""
    )
    if isinstance(candidate, Mapping):
        candidate = candidate.get("name", "")
    candidate = str(candidate)
    if "." in candidate:
        namespace, name = candidate.split(".", 1)
    else:
        namespace = raw.get("namespace") or default_namespace
        name = candidate or str(raw.get("id") or "tool")
    return namespace, name


def parse_tool_calls(
    tool_calls: Sequence[Mapping[str, Any]],
    *,
    default_namespace: str = "functions",
) -> List[HarmonyToolCall]:
    """Convert raw Harmony tool call payloads into :class:`HarmonyToolCall` objects."""

    parsed: List[HarmonyToolCall] = []
    for raw in tool_calls:
        namespace, name = _extract_name(raw, default_namespace)
        raw_arguments = raw.get("arguments")
        arguments: Mapping[str, Any] = {}
        error: str | None = None
        if isinstance(raw_arguments, Mapping):
            arguments = raw_arguments  # type: ignore[assignment]
            raw_arguments_str: str | None = json.dumps(raw_arguments)
        elif isinstance(raw_arguments, str):
            raw_arguments_str = raw_arguments
            try:
                arguments = json.loads(raw_arguments) if raw_arguments.strip() else {}
            except json.JSONDecodeError as exc:
                error = f"Invalid JSON arguments: {exc}".strip()
                arguments = {}
        elif raw_arguments is None:
            raw_arguments_str = None
        else:
            raw_arguments_str = str(raw_arguments)
            try:
                arguments = json.loads(raw_arguments_str)
            except json.JSONDecodeError:
                arguments = {"value": raw_arguments}
        if not arguments and isinstance(raw.get("input"), Mapping):
            arguments = raw["input"]  # type: ignore[assignment]
            raw_arguments_str = json.dumps(arguments)
        call = HarmonyToolCall(
            id=str(raw.get("id") or raw.get("call_id") or f"call_{len(parsed)}"),
            name=name,
            namespace=namespace,
            arguments=arguments,
            raw_arguments=raw_arguments_str,
            type=str(raw.get("type")) if raw.get("type") else None,
            raw=raw,
            error=error,
        )
        parsed.append(call)
    return parsed


def build_assistant_tool_call(
    tool_name: str,
    arguments: Mapping[str, Any] | str,
    *,
    namespace: str = "functions",
    call_id: str | None = None,
) -> Mapping[str, Any]:
    """Render a Harmony-formatted assistant tool call message."""

    if isinstance(arguments, str):
        payload = arguments
        constrain = "json" if arguments.strip().startswith("{") else None
    else:
        payload = json.dumps(arguments, ensure_ascii=False)
        constrain = "json"
    message: MutableMapping[str, Any] = {
        "role": "assistant",
        "channel": "commentary",
        "recipient": f"{namespace}.{tool_name}" if namespace else tool_name,
        "content": payload,
        "terminator": "<|call|>",
    }
    if constrain:
        message["constrain"] = constrain
    if call_id:
        message["id"] = call_id
    return message


def build_tool_result_message(
    tool_name: str,
    result: Any,
    *,
    namespace: str = "functions",
    call_id: str | None = None,
    is_error: bool = False,
    metadata: Mapping[str, Any] | None = None,
) -> Mapping[str, Any]:
    """Render a Harmony-formatted tool response message back to the assistant."""

    if isinstance(result, str):
        content = result
        constrain = None
    else:
        content = json.dumps(result, ensure_ascii=False)
        constrain = "json"

    message: MutableMapping[str, Any] = {
        "role": "tool",
        "channel": "commentary",
        "recipient": "assistant",
        "name": tool_name,
        "content": content,
    }
    if namespace:
        message["tool_name"] = f"{namespace}.{tool_name}"
    if constrain:
        message["constrain"] = constrain
    if call_id:
        message["id"] = call_id
        message["call_id"] = call_id
    if is_error:
        message["error"] = True
    if metadata:
        message["meta"] = dict(metadata)
    return message


__all__ = [
    "ToolDefinition",
    "HarmonyToolCall",
    "render_tool_developer_message",
    "parse_tool_calls",
    "build_assistant_tool_call",
    "build_tool_result_message",
]
