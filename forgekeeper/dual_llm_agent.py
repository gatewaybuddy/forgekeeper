from forgekeeper.load_env import init_env
init_env()

import os
from forgekeeper.app.chats.memory_store import (
    save_message,
    summarize_thoughts,
    get_memory,
    set_memory,
)
from forgekeeper.app.services.llm_router import (
    get_core_model_name,
    get_coder_model_name,
)
from forgekeeper.app.utils.json_helpers import extract_json
from forgekeeper.app.chats.memory_vector import retrieve_similar_entries
from forgekeeper.app.services.prompt_formatting import build_memory_prompt
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.llm.clients import openai_compat_client
from forgekeeper.agent.tool_utils import build_tool_specs, execute_tool_call
from forgekeeper.task_pipeline import TaskPipeline
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.memory.episodic import append_entry
from pathlib import Path
from forgekeeper.multi_agent_planner import split_for_agents
from forgekeeper.agent.communication import broadcast_context, get_shared_context

log = get_logger(__name__, debug=DEBUG_MODE)

def add_goal(session_id, goal):
    memory = get_memory(session_id)
    goals = memory.get("goal_stack", [])
    goals.append(goal)
    memory["goal_stack"] = goals
    set_memory(session_id, memory)

def add_subtasks(session_id, subtasks):
    memory = get_memory(session_id)
    memory["task_queue"] = subtasks
    set_memory(session_id, memory)

from types import SimpleNamespace


def get_next_task(session_id):
    """Poll the task scheduler for the next task.

    The selected task description is appended to the session's in-memory
    ``task_queue`` for traceability and returned to the caller. If no tasks are
    available ``None`` is returned.
    """

    pipeline = TaskPipeline()
    task = pipeline.next_task()
    if not task:
        return None

    desc = getattr(task, "description", None)
    if desc is None and isinstance(task, dict):
        desc = task.get("title") or task.get("description") or ""

    memory = get_memory(session_id)
    queue = memory.get("task_queue", [])
    queue.append(desc)
    memory["task_queue"] = queue
    set_memory(session_id, memory)

    if isinstance(task, dict):
        return SimpleNamespace(description=desc, **task)
    return task


def execute_next_task(session_id: str) -> None:
    """Execute the next scheduled task using the coder agent.

    The coder is prompted to return JSON containing ``file_path`` and the full
    ``updated_code`` for that file. A unified diff is shown via
    :func:`change_stager.diff_and_stage_changes`, and the user is asked to
    confirm before committing. Outcomes are recorded in episodic memory.
    """

    task = get_next_task(session_id)
    if not task:
        log.info("No tasks available.")
        return

    task_id = f"{abs(hash(task.description)) % 1000000:06d}"
    coder_prompt = (
        "You are the Coder agent. Apply the following task to the repository:\n"
        f"{task.description}\n"
        "Respond with JSON containing 'file_path' and 'updated_code' representing"
        " the complete new file contents."
    )
    response = ask_coder(coder_prompt, session_id)
    try:
        data = extract_json(response) if isinstance(response, str) else response
    except Exception as exc:
        log.error(f"Failed to parse coder response: {exc}")
        append_entry(task_id, task.description, "parse-error", [], "Failed to parse coder response", [])
        return
    file_path = data.get("file_path") if isinstance(data, dict) else None
    updated_code = data.get("updated_code", "") if isinstance(data, dict) else ""

    if not file_path:
        log.error("Coder response missing 'file_path'; aborting task.")
        append_entry(task_id, task.description, "no-file", [], "Coder response missing file path", [])
        return

    p = Path(file_path)
    original = p.read_text(encoding="utf-8") if p.exists() else ""
    result = diff_and_stage_changes(original, updated_code, file_path, auto_stage=False, task_id=task_id)
    outcome = result.get("outcome")
    files = result.get("files", [])

    if outcome != "success":
        append_entry(task_id, task.description, outcome or "error", files, "Changes not staged", [])
        return

    if input("Commit staged changes? [y/N]: ").strip().lower().startswith("y"):
        commit_and_push_changes(f"feat: {task.description}", task_id=task_id)
        TaskPipeline().mark_done(task.description)
        append_entry(task_id, task.description, "committed", files, "Changes committed", [])
    else:
        from git import Repo

        repo = Repo(p.resolve().parent, search_parent_directories=True)
        repo.git.restore("--staged", file_path)
        repo.git.checkout("--", file_path)
        append_entry(task_id, task.description, "aborted", [], "Commit declined", [])

def ask_core(prompt, session_id):
    """Send ``prompt`` to the core model and handle tool calls."""
    from forgekeeper.app.utils.system_prompt_builder import build_system_prompt

    system_prompt = build_system_prompt(session_id)
    context = summarize_thoughts(session_id)
    memory = get_memory(session_id)
    prompt_mode = memory.get("prompt_mode", "inst")
    retrieved = retrieve_similar_entries(session_id, prompt, top_k=3)
    vector_summary = "\n".join(f"- {doc}" for doc, meta in retrieved) if retrieved else ""
    full_prompt = build_memory_prompt(prompt, system_prompt, context, vector_summary, prompt_mode)

    messages = [{"role": "user", "content": full_prompt}]
    tools = build_tool_specs()
    message = openai_compat_client.chat("core", messages, tools=tools)
    tool_calls = message.get("tool_calls") or []
    if tool_calls:
        messages.append(message)
        for call in tool_calls:
            result = execute_tool_call(call)
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": result})
        message = openai_compat_client.chat("core", messages)

    content = message.get("content", "")
    save_message(session_id, "core", content)
    try:
        return extract_json(content)
    except Exception:
        return content

def postprocess_response(response):
    import re
    if isinstance(response, dict) and "response" in response:
        response = response["response"]

    response = re.sub(r"```(?:\w+)?\n(.*?)```", lambda m: "\n".join("    " + line for line in m.group(1).splitlines()), response, flags=re.DOTALL)
    response = response.replace("\n", "\n").replace('\"', '"').strip()
    return response

def ask_coder(prompt, session_id):
    """Send ``prompt`` to the coder model and handle tool calls."""
    save_message(session_id, "user", prompt)
    messages = [{"role": "user", "content": prompt}]
    tools = build_tool_specs()
    message = openai_compat_client.chat("coder", messages, tools=tools)
    tool_calls = message.get("tool_calls") or []
    if tool_calls:
        messages.append(message)
        for call in tool_calls:
            result = execute_tool_call(call)
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": result})
        message = openai_compat_client.chat("coder", messages)

    content = message.get("content", "")
    save_message(session_id, "assistant", content)
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

    core_model = get_core_model_name()
    memory = get_memory(session_id)
    parsed = ask_core(user_input, session_id)

    if isinstance(parsed, dict):
        if parsed.get("action") == "delegate_to_coder":
            task = parsed.get("task", "unspecified")
            log.info("\n[Core ➡️ Coder] Delegating to the coding agent.\n")
            return postprocess_response(ask_coder(task, session_id))

        if "response" in parsed:
            log.info("\n[Core 🧠] Handling this task directly.\n")
            return postprocess_response(parsed["response"])

    log.info("\n[Core 🧠] Responding in freeform.\n")
    return postprocess_response(parsed if isinstance(parsed, str) else str(parsed))

if __name__ == "__main__":
    core_model = get_core_model_name()
    coder_model = get_coder_model_name()
    log.info(f"\n🧪 Dual LLM Architecture: Core ({core_model}) + Coder ({coder_model})\n")
    while True:
        lines = []
        line = input("You > ")
        while True:
            if line.strip().lower() == "exit":
                exit()
            elif line.strip().lower() == "summarize":
                log.info("\n🧠 Memory Summary:\n")
                log.info(summarize_thoughts("session_kai"))
                log.info("\n" + "-" * 50 + "\n")
                break
            elif line.strip().lower() == "nexttask":
                execute_next_task("session_kai")
                break
            elif line.strip() == "<<END>>":
                break
            lines.append(line)
            line = input()
            if line.strip().lower() == "exit":
                exit()
            elif line.strip().lower() == "summarize":
                log.info("\n🧠 Memory Summary:\n")
                log.info(summarize_thoughts("session_kai"))
                log.info("\n" + "-" * 50 + "\n")
                break
            elif line.strip().lower() == "nexttask":
                execute_next_task("session_kai")
                break
            elif line.strip() == "<<END>>":
                break
            lines.append(line)

        user_input = "\n".join(lines).strip()
        if user_input:
            output = route_intent(user_input, session_id="session_kai")
            log.info("\nForgeKeeper > %s", output)
            log.info("\n" + "-" * 50 + "\n")
