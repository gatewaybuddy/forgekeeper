from __future__ import annotations

import json

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.llm.tool_usage import (
    HarmonyToolCall,
    ToolDefinition,
    build_assistant_tool_call,
    build_tool_result_message,
    parse_tool_calls,
    render_tool_developer_message,
)


def test_render_tool_developer_message_groups_by_namespace():
    tools = [
        ToolDefinition(
            name="write_file",
            description="Write text content to disk.",
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        ),
        ToolDefinition(
            name="fetch_url",
            description="Fetch a URL.",
            namespace="http",
            input_schema={
                "type": "object",
                "properties": {"url": {"type": "string", "format": "uri"}},
                "required": ["url"],
            },
        ),
    ]

    message = render_tool_developer_message(tools)

    assert message["role"] == "developer"
    assert "namespace functions" in message["content"]
    assert "namespace http" in message["content"]
    assert "type write_file" in message["content"]
    assert "type fetch_url" in message["content"]


def test_parse_tool_calls_handles_string_arguments():
    raw_calls = [
        {
            "id": "call_1",
            "name": "functions.lookup",
            "arguments": json.dumps({"city": "SF"}),
        }
    ]

    parsed = parse_tool_calls(raw_calls)

    assert len(parsed) == 1
    call = parsed[0]
    assert isinstance(call, HarmonyToolCall)
    assert call.namespace == "functions"
    assert call.name == "lookup"
    assert call.arguments == {"city": "SF"}
    assert call.error is None


def test_parse_tool_calls_records_errors_for_invalid_json():
    raw_calls = [
        {
            "id": "call_2",
            "tool_name": "functions.bad",
            "arguments": "{not-json}",
        }
    ]

    parsed = parse_tool_calls(raw_calls)

    assert parsed[0].arguments == {}
    assert parsed[0].error is not None
    assert "Invalid JSON arguments" in parsed[0].error


def test_build_assistant_tool_call_formats_json_payload():
    message = build_assistant_tool_call("lookup", {"query": "weather"}, call_id="abc")

    assert message["role"] == "assistant"
    assert message["recipient"] == "functions.lookup"
    assert message["terminator"] == "<|call|>"
    assert json.loads(message["content"]) == {"query": "weather"}
    assert message["id"] == "abc"
    assert message["constrain"] == "json"


def test_build_tool_result_message_supports_json_and_errors():
    json_message = build_tool_result_message("lookup", {"result": 42}, call_id="123")
    assert json_message["role"] == "tool"
    assert json_message["tool_name"] == "functions.lookup"
    assert json.loads(json_message["content"]) == {"result": 42}
    assert json_message["constrain"] == "json"

    text_message = build_tool_result_message(
        "lookup",
        "not found",
        call_id="456",
        is_error=True,
        metadata={"status": 404},
    )
    assert text_message["content"] == "not found"
    assert text_message["error"] is True
    assert text_message["meta"] == {"status": 404}


def test_tool_definition_round_trip_with_mcp_namespace():
    tool = ToolDefinition(
        name="list_tasks",
        description="List tasks from MCP server.",
        namespace="mcp",
        input_schema={"type": "object", "properties": {"status": {"type": "string"}}},
    )

    mcp_payload = tool.to_mcp_tool()
    restored = ToolDefinition.from_mcp(mcp_payload, default_namespace="functions")

    assert restored.namespace == "mcp"
    assert restored.name == "list_tasks"
    assert restored.description == "List tasks from MCP server."


def test_render_tool_developer_message_with_guardrails():
    """Test that tool-enabled mode includes guardrail documentation (T28)."""
    tools = [
        ToolDefinition(
            name="read_file",
            description="Read a file",
            input_schema={"type": "object", "properties": {"path": {"type": "string"}}},
        ),
    ]

    # With guardrails (default)
    message = render_tool_developer_message(tools, include_guardrails=True)

    assert message["role"] == "developer"
    assert message["channel"] == "commentary"
    content = message["content"]

    # Check for guardrail sections
    assert "TOOL SYSTEM GUARDRAILS" in content
    assert "ALLOWLIST" in content
    assert "19 curated tools" in content
    assert "VALIDATION" in content
    assert "EXECUTION LIMITS" in content
    assert "30 seconds per tool call" in content
    assert "1MB maximum size" in content
    assert "100 requests burst, 10 per second sustained" in content
    assert "SECURITY" in content
    assert "Sensitive data" in content
    assert "redacted in logs" in content
    assert "ERROR HANDLING" in content
    assert "TOOL USAGE BEST PRACTICES" in content
    assert "When to use tools" in content
    assert "When NOT to use tools" in content
    assert "Error recovery" in content

    # Check that tool definitions are still present
    assert "namespace functions" in content
    assert "type read_file" in content


def test_render_tool_developer_message_without_guardrails():
    """Test that tool-disabled mode excludes guardrail documentation (T28)."""
    tools = [
        ToolDefinition(
            name="read_file",
            description="Read a file",
            input_schema={"type": "object", "properties": {"path": {"type": "string"}}},
        ),
    ]

    # Without guardrails
    message = render_tool_developer_message(tools, include_guardrails=False)

    assert message["role"] == "developer"
    assert message["channel"] == "commentary"
    content = message["content"]

    # Should NOT have guardrail sections
    assert "TOOL SYSTEM GUARDRAILS" not in content
    assert "TOOL USAGE BEST PRACTICES" not in content

    # Should still have tool definitions
    assert "namespace functions" in content
    assert "type read_file" in content


def test_render_tool_developer_message_empty_tools_with_guardrails():
    """Test that empty tool list returns appropriate message regardless of guardrails."""
    # With guardrails
    message_with = render_tool_developer_message([], include_guardrails=True)
    assert message_with["content"] == "# Tools\n\n// No tools registered."

    # Without guardrails
    message_without = render_tool_developer_message([], include_guardrails=False)
    assert message_without["content"] == "# Tools\n\n// No tools registered."


def test_render_tool_developer_message_mentions_t11_t12_t21_t22():
    """Test that guardrail content mentions key implemented tasks (T28)."""
    tools = [
        ToolDefinition(
            name="echo",
            description="Echo text",
            input_schema={"type": "object", "properties": {"text": {"type": "string"}}},
        ),
    ]

    message = render_tool_developer_message(tools, include_guardrails=True)
    content = message["content"]

    # Check for features from T11, T12, T21, T22
    assert "allowlist" in content.lower()
    assert "validation" in content.lower()
    assert "timeout" in content.lower()
    assert "rate limit" in content.lower()
    assert "redacted" in content.lower()
    assert "contextlog" in content.lower() or "correlation id" in content.lower()


def test_config_constants_exist():
    """Test that config.py has tool prompt constants (T28)."""
    import sys
    from pathlib import Path

    # Import config module
    ROOT = Path(__file__).resolve().parents[1]
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    from forgekeeper import config

    # Check that constants exist
    assert hasattr(config, "TOOL_PROMPT_INCLUDE_GUARDRAILS")
    assert hasattr(config, "TOOL_PROMPT_VARIANT")

    # Check default values
    assert isinstance(config.TOOL_PROMPT_INCLUDE_GUARDRAILS, bool)
    assert isinstance(config.TOOL_PROMPT_VARIANT, str)
    assert config.TOOL_PROMPT_VARIANT in ["enabled", "disabled"] or config.TOOL_PROMPT_VARIANT == "enabled"
