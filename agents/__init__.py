from forgekeeper.load_env import init_env
init_env()

from forgekeeper.app.chats.memory_store import (
    save_message,
    summarize_thoughts,
    get_memory,
)
from forgekeeper.app.chats.memory_vector import retrieve_similar_entries
from forgekeeper.app.services.llm_router import (
    get_core_model_name,
    get_coder_model_name,
)
from forgekeeper.app.services.prompt_formatting import build_memory_prompt
from forgekeeper.agent.communication import broadcast_context, get_shared_context
from forgekeeper.agent.tool_utils import build_tool_specs, execute_tool_call
from forgekeeper.config import DEBUG_MODE
from forgekeeper.llm.clients import openai_compat_client
from forgekeeper.logger import get_logger
from forgekeeper.app.utils.json_helpers import extract_json
from forgekeeper.multi_agent_planner import split_for_agents, track_agent

log = get_logger(__name__, debug=DEBUG_MODE)


def ask_core(prompt, session_id):
    """Send ``prompt`` to the core model and handle tool calls."""
    from forgekeeper.app.utils.system_prompt_builder import build_system_prompt

    system_prompt = build_system_prompt(session_id)
    context = summarize_thoughts(session_id)
    memory = get_memory(session_id)
    prompt_mode = memory.get("prompt_mode", "inst")
    retrieved = retrieve_similar_entries(session_id, session_id, prompt, top_k=3)
    vector_summary = "\n".join(f"- {doc}" for doc, _ in retrieved) if retrieved else ""
    full_prompt = build_memory_prompt(
        prompt, system_prompt, context, vector_summary, prompt_mode
    )

    messages = [{"role": "user", "content": full_prompt}]
    tools = build_tool_specs()
    message = openai_compat_client.chat("core", messages, tools=tools)
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
        message = openai_compat_client.chat("core", messages)

    content = message.get("content", "")
    save_message(session_id, "core", content, project_id=session_id)
    try:
        return extract_json(content)
    except Exception:
        return content


def postprocess_response(response):
    import re

    if isinstance(response, dict) and "response" in response:
        response = response["response"]

    response = re.sub(
        r"```(?:\\w+)?\\n(.*?)```",
        lambda m: "\n".join("    " + line for line in m.group(1).splitlines()),
        response,
        flags=re.DOTALL,
    )
    response = response.replace("\n", "\n").replace('\\"', '"').strip()
    return response


def ask_coder(prompt, session_id):
    """Send ``prompt`` to the coder model and handle tool calls."""
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
    save_message(session_id, "assistant", content, project_id=session_id)
    return content


def route_intent(user_input, session_id):
    plan = split_for_agents(user_input)
    broadcast_context("user", user_input)

    if len(plan) > 1:
        responses = []
        for item in plan:
            context_lines = "\n".join(
                f"{c['agent']}: {c['message']}" for c in get_shared_context()
            )
            prompt = (
                f"{item['task']}\n\nShared context:\n{context_lines}"
                if context_lines
                else item["task"]
            )

            with track_agent(item["agent"]):
                if item["agent"] == "coder":
                    raw = ask_coder(prompt, session_id)
                else:
                    raw = ask_core(prompt, session_id)
                    if isinstance(raw, dict) and "response" in raw:
                        raw = raw["response"]

            text = postprocess_response(raw)
            broadcast_context(item["agent"], text)
            responses.append(f"{item['agent']}: {text}")
        return "\n".join(responses)

    get_core_model_name()  # touch for consistency/logging
    with track_agent("core"):
        parsed = ask_core(user_input, session_id)

    if isinstance(parsed, dict):
        if parsed.get("action") == "delegate_to_coder":
            task = parsed.get("task", "unspecified")
            log.info("\n[Core ➡️ Coder] Delegating to the coding agent.\n")
            with track_agent("coder"):
                result = ask_coder(task, session_id)
            return postprocess_response(result)

        if "response" in parsed:
            log.info("\n[Core 🧠] Handling this task directly.\n")
            return postprocess_response(parsed["response"])

    log.info("\n[Core 🧠] Responding in freeform.\n")
    return postprocess_response(parsed if isinstance(parsed, str) else str(parsed))


from .session_memory import add_goal, add_subtasks
from .task_executor import get_next_task, execute_next_task

__all__ = [
    "ask_core",
    "ask_coder",
    "route_intent",
    "add_goal",
    "add_subtasks",
    "get_next_task",
    "execute_next_task",
]
