import json
import os
from forgekeeper.app.services.llm_service_llamacpp import ask_llm
from forgekeeper.app.chats.memory_store import (
    get_memory, set_memory,
    get_pending_confirmation, set_pending_confirmation
)
from forgekeeper.app.services.file_writer import write_function_file

def set_runtime_env(key, value):
    os.environ[key] = str(value)

# Step 1: Ask the model for structured intent from user input
def extract_intent_with_llm(llm, user_input):
    prompt = (
        "Extract the user's intent and return structured JSON.\n"
        "Supported actions: set_mode, update_env, adjust_style, write_function, none.\n"
        "For write_function, return: { \"action\": \"write_function\", \"value\": {\"name\": ..., \"code\": ...} }\n"
        "Example:\n"
        "{ \"action\": \"set_mode\", \"value\": \"chat\", \"confidence\": 0.92, \"explanation\": \"User asked to chat casually.\" }\n"
        f"User message: {user_input.strip()}"
    )
    try:
        return ask_llm(prompt)
    except json.JSONDecodeError:
        return {"action": "none", "value": None, "confidence": 0.0, "explanation": "Failed to parse intent."}

# Step 2: Capture that intent and request user confirmation
def handle_possible_intent(session_id, llm, user_input):
    intent = extract_intent_with_llm(llm, user_input)
    if intent["action"] != "none" and intent["confidence"] >= 0.7:
        set_pending_confirmation(session_id, intent)
        return f"It sounds like you want me to: {intent['explanation']} Should I go ahead?"
    return None

# Step 3: Execute the action if user consents
def confirm_intended_action(session_id, user_input):
    lowered = user_input.lower()
    if lowered in {"yes", "do it", "go ahead", "sure", "that's right", "ok", "yep"}:
        intent = get_pending_confirmation(session_id)
        if not intent:
            return None

        action = intent["action"]
        value = intent["value"]

        if action == "set_mode":
            get_memory(session_id)["prompt_mode"] = value
            return f"Chat mode switched to '{value}'."

        elif action == "update_env":
            if "=" in value:
                key, val = value.split("=", 1)
                set_runtime_env(key.strip(), val.strip())
                return f"Updated environment variable {key.strip()} to {val.strip()}."

        elif action == "adjust_style":
            get_memory(session_id)["style"] = value
            return f"Response style adjusted to '{value}'."

        elif action == "write_function":
            if isinstance(value, dict) and "name" in value and "code" in value:
                filename = f"{value['name'].strip()}.py"
                return write_function_file(filename, value['code'].strip(), directory="functions")

        return "Intent confirmed, but no known action was performed."

    return None

def handle_possible_intent(session_id, llm, user_input):
    intent = extract_intent_with_llm(llm, user_input)

    if not isinstance(intent, dict) or "action" not in intent:
        return "Sorry, I couldn’t understand what you want me to do."

    if intent["action"] != "none" and intent.get("confidence", 0) >= 0.7:
        set_pending_confirmation(session_id, intent)
        return f"It sounds like you want me to: {intent['explanation']} Should I go ahead?"

    return None
