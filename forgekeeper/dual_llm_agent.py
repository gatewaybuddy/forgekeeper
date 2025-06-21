from forgekeeper.load_env import init_env
init_env()

import os
from forgekeeper.app.chats.memory_store import save_message, summarize_thoughts, get_memory, set_memory
from llama_cpp import Llama
from forgekeeper.app.services.llm_router import get_core_model_name, get_coder_model_name, ask_llm
from forgekeeper.app.utils.json_helpers import extract_json
from forgekeeper.app.chats.memory_vector import retrieve_similar_entries
from forgekeeper.app.services.prompt_formatting import build_memory_prompt
from forgekeeper.app.services.reflective_ask_core import reflective_ask_core

def _llm_ask(self, prompt: str):
    try:
        result = self(prompt=prompt, max_tokens=800, stop=["<|endoftext|>"])
        return result["choices"][0]["text"].strip()
    except Exception as e:
        return f"[ERROR] {str(e)}"

setattr(Llama, "ask", _llm_ask)

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

def get_next_task(session_id):
    memory = get_memory(session_id)
    queue = memory.get("task_queue", [])
    return queue.pop(0) if queue else None

def ask_core(prompt, session_id):
    use_reflection = os.getenv("USE_REFLECTIVE_CORE", "true").lower() == "true"
    if use_reflection:
        return reflective_ask_core(prompt, session_id)

    # fallback to simple single-pass Core logic
    from forgekeeper.app.utils.system_prompt_builder import build_system_prompt
    system_prompt = build_system_prompt(session_id)
    context = summarize_thoughts(session_id)
    memory = get_memory(session_id)
    prompt_mode = memory.get("prompt_mode", "inst")
    retrieved = retrieve_similar_entries(session_id, prompt, top_k=3)
    vector_summary = "\n".join(f"- {doc}" for doc, meta in retrieved) if retrieved else ""
    full_prompt = build_memory_prompt(prompt, system_prompt, context, vector_summary, prompt_mode)
    response = ask_llm(full_prompt)
    save_message(session_id, "core", response)
    return response

def postprocess_response(response):
    import re
    if isinstance(response, dict) and "response" in response:
        response = response["response"]

    response = re.sub(r"```(?:\w+)?\n(.*?)```", lambda m: "\n".join("    " + line for line in m.group(1).splitlines()), response, flags=re.DOTALL)
    response = response.replace("\n", "\n").replace('\"', '"').strip()
    return response

def ask_coder(prompt, session_id):
    from forgekeeper.app.shared.models import llm_coder
    save_message(session_id, "user", prompt)
    response = llm_coder.ask(prompt)
    save_message(session_id, "assistant", response)
    return response

def route_intent(user_input, session_id):
    core_model = get_core_model_name()
    memory = get_memory(session_id)
    parsed = ask_core(user_input, session_id)

    if isinstance(parsed, dict):
        if parsed.get("action") == "delegate_to_coder":
            task = parsed.get("task", "unspecified")
            print("\n[Core ➡️ Coder] Delegating to the coding agent.\n")
            return postprocess_response(ask_coder(task, session_id))

        if "response" in parsed:
            print("\n[Core 🧠] Handling this task directly.\n")
            return postprocess_response(parsed["response"])

    print("\n[Core 🧠] Responding in freeform.\n")
    return postprocess_response(parsed if isinstance(parsed, str) else str(parsed))

if __name__ == "__main__":
    core_model = get_core_model_name()
    coder_model = get_coder_model_name()
    print(f"\n🧪 Dual LLM Architecture: Core ({core_model}) + Coder ({coder_model})\n")
    while True:
        print("You >", end=" ")
        lines = []
        while True:
            line = input()
            if line.strip().lower() == "exit":
                exit()
            elif line.strip().lower() == "summarize":
                print("\n🧠 Memory Summary:\n")
                print(summarize_thoughts("session_kai"))
                print("\n" + "-"*50 + "\n")
                break
            elif line.strip() == "<<END>>":
                break
            lines.append(line)

        user_input = "\n".join(lines).strip()
        if user_input:
            output = route_intent(user_input, session_id="session_kai")
            print("\nForgeKeeper >", output)
            print("\n" + "-"*50 + "\n")
