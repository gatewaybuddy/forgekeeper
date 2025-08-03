import os
from forgekeeper.app.chats.memory_store import (
    set_think_aloud, grant_think_aloud_consent,
    summarize_thoughts, request_think_aloud,
    get_memory
)
from forgekeeper.app.utils.prompt_guard import verify_prompt
from forgekeeper.app.interpreter.intent_parser import (
    handle_possible_intent, confirm_intended_action
)

DEFAULT_SYS_PROMPT = os.getenv("DEFAULT_SYS_PROMPT", "You are ForgeKeeper, a helpful AI assistant and code crafter.")
DEFAULT_PROMPT_MODE = os.getenv("DEFAULT_PROMPT_MODE", "inst").lower()

def get_system_prompt(session_id):
    return get_memory(session_id).get("system_prompt", DEFAULT_SYS_PROMPT)

def set_system_prompt(session_id, sys_prompt):
    get_memory(session_id)["system_prompt"] = sys_prompt

def get_prompt_mode(session_id):
    return get_memory(session_id).get("prompt_mode", DEFAULT_PROMPT_MODE)

def set_prompt_mode(session_id, mode):
    get_memory(session_id)["prompt_mode"] = mode.lower().strip()

def wrap_prompt(user_input, session_id, mode=None):
    """
    Wrap the user's input with the appropriate formatting for the model.
    """
    mode = mode or get_prompt_mode(session_id)
    sys_prompt = get_system_prompt(session_id)
    prompt = verify_prompt(user_input.strip())

    # Slight boost: If user says "write a function", prefer instruction format unless overridden
    if "write a function" in prompt.lower() and mode == "inst":
        mode = "instruction"

    if mode == "inst":
        return f"[INST] <<SYS>>\n{sys_prompt}\n<</SYS>>\n\n{prompt} [/INST]"
    elif mode == "instruction":
        return f"### Instruction:\n{prompt}\n\n### Response:"
    elif mode == "chat":
        return f"User: {prompt}\nAssistant:"
    else:
        return prompt

def interpret_prompt(user_input, session_id, llm=None):
    user_input = verify_prompt(user_input)
    lowered = user_input.lower()

    # Handle confirmation flow
    confirmation = confirm_intended_action(session_id, lowered)
    if confirmation:
        return confirmation

    # Update system prompt directly
    if lowered.startswith("set system prompt to"):
        new_sys = user_input.partition("to")[2].strip()
        set_system_prompt(session_id, new_sys)
        return f"System prompt updated."

    # Think-aloud flow
    if "share your thoughts" in lowered or "think aloud" in lowered:
        if "would you like" in lowered or "are you comfortable" in lowered:
            grant_think_aloud_consent(session_id, True)
            return "I'll respect your choice to think aloud or not."
        elif request_think_aloud(session_id):
            set_think_aloud(session_id, True)
            return "Internal thoughts will now be shared aloud."
        else:
            return "I haven’t consented to think aloud mode yet."

    if "turn off think_aloud" in lowered or "stop thinking aloud" in lowered:
        set_think_aloud(session_id, False)
        return "Okay, internal thoughts will stay private."

    if "summarize what you've been thinking" in lowered or "what have you been thinking" in lowered:
        return summarize_thoughts(session_id)

    # Forward to LLM-based intent parser
    if llm is not None:
        return handle_possible_intent(session_id, llm, user_input)

    return None
