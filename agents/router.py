import re

from forgekeeper.agent.communication import broadcast_context, get_shared_context
from forgekeeper.app.services.llm_router import get_core_model_name
from forgekeeper.config import DEBUG_MODE
from forgekeeper.logger import get_logger
from forgekeeper.multi_agent_planner import split_for_agents, track_agent

from .coder import ask_coder
from .core import ask_core

log = get_logger(__name__, debug=DEBUG_MODE)


def postprocess_response(response):
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
