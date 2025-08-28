from forgekeeper.app.chats.memory import (
    save_message,
    summarize_thoughts,
    get_memory,
)
from forgekeeper.app.chats.memory_vector import retrieve_similar_entries
from forgekeeper.app.services.graphql_client import send_message
from forgekeeper.app.services.prompt_formatting import build_memory_prompt
from forgekeeper.app.utils.system_prompt_builder import build_system_prompt
from forgekeeper.agent.tool_utils import build_tool_specs, execute_tool_call
from forgekeeper.llm.clients import client
from forgekeeper.app.utils.json_helpers import extract_json


def ask_core(prompt, session_id):
    """Send ``prompt`` to the core model and handle tool calls."""
    system_prompt = build_system_prompt(session_id)
    context = summarize_thoughts(session_id)
    memory = get_memory(session_id)
    prompt_mode = memory.get("prompt_mode", "inst")
    retrieved = retrieve_similar_entries(session_id, session_id, prompt, top_k=3)
    vector_summary = "\n".join(f"- {doc}" for doc, _ in retrieved) if retrieved else ""
    full_prompt = build_memory_prompt(
        prompt, system_prompt, context, vector_summary, prompt_mode
    )

    send_message(
        "forgekeeper/task",
        {"conversationId": session_id, "role": "user", "content": full_prompt},
        project_id=session_id,
    )
    messages = [{"role": "user", "content": full_prompt}]
    tools = build_tool_specs()
    message = client.chat("core", messages, tools=tools)
    tool_calls = message.get("tool_calls") or []
    if tool_calls:
        messages.append(message)
        for call in tool_calls:
            result = execute_tool_call(call)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id", ""),
                    "content": result,
                }
            )
        message = client.chat("core", messages)

    content = message.get("content", "")
    send_message(
        "forgekeeper/task",
        {"conversationId": session_id, "role": "assistant", "content": content},
        project_id=session_id,
    )
    save_message(session_id, "core", content, project_id=session_id)
    try:
        return extract_json(content)
    except Exception:
        return content
