from forgekeeper.app.chats.memory import save_message
from forgekeeper.app.services.graphql_client import send_message
from forgekeeper.agent.tool_utils import build_tool_specs, execute_tool_call
from forgekeeper.llm.clients import openai_compat_client


def ask_coder(prompt, session_id):
    """Send ``prompt`` to the coder model and handle tool calls."""
    send_message(
        "forgekeeper/task",
        {"conversationId": session_id, "role": "user", "content": prompt},
        project_id=session_id,
    )
    save_message(session_id, "user", prompt, project_id=session_id)
    messages = [{"role": "user", "content": prompt}]
    tools = build_tool_specs()
    message = openai_compat_client.chat("coder", messages, tools=tools)
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
        message = openai_compat_client.chat("coder", messages)

    content = message.get("content", "")
    send_message(
        "forgekeeper/task",
        {"conversationId": session_id, "role": "assistant", "content": content},
        project_id=session_id,
    )
    save_message(session_id, "assistant", content, project_id=session_id)
    return content
