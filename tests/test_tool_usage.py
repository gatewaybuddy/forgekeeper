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
