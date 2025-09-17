import os
import time
import json
from openai import OpenAI
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt

# Initialize client and model
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
log = get_logger(__name__, debug=DEBUG_MODE)

def ask_llm(prompt: str, system_message: str | None = None, tools: list | None = None):
    """Send ``prompt`` to the OpenAI chat completion API.

    If ``tools`` are provided, they are forwarded to the model to enable
    function calling.  When the model requests a function call the returned
    value will be a ``{"function_call": {"name": ..., "arguments": ...}}``
    dictionary; otherwise the assistant's text response is returned.
    """

    messages: list[dict] = []
    prompt = verify_prompt(prompt)

    if system_message:
        messages.append({"role": "system", "content": system_message})

    messages.append({"role": "user", "content": prompt})

    log.info("\n[ask_llm] Sending prompt to OpenAI...\n")
    log.info(f"[Model] {MODEL}")
    log.debug(f"[System Message] {system_message[:100] + '...' if system_message else '(None)'}")
    log.debug(f"[Prompt Preview] {prompt[:400]}...\n")

    start = time.time()
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=1000,
        tools=tools,
    )
    elapsed = time.time() - start

    log.info(f"[ask_llm] Response received in {elapsed:.2f} seconds\n")

    message = response.choices[0].message

    # Prefer tool calls if the model requests one
    tool_calls = getattr(message, "tool_calls", None) or []
    if tool_calls:
        call = tool_calls[0]
        name = getattr(call.function, "name", "")
        args_json = getattr(call.function, "arguments", "{}")
        try:
            args = json.loads(args_json)
        except Exception:
            args = {}
        return {"function_call": {"name": name, "arguments": args}}

    # Older models may use the deprecated ``function_call`` field
    func_call = getattr(message, "function_call", None)
    if func_call:
        name = getattr(func_call, "name", "")
        args_json = getattr(func_call, "arguments", "{}")
        try:
            args = json.loads(args_json)
        except Exception:
            args = {}
        return {"function_call": {"name": name, "arguments": args}}

    return (message.content or "").strip()
