import os
import re
from pathlib import Path
from llama_cpp import Llama
from dotenv import load_dotenv

from forgekeeper.app.chats.memory import (
    get_memory,
    save_message,
    set_think_aloud,
    grant_think_aloud_consent,
    summarize_thoughts,
    request_think_aloud,
)

from forgekeeper.functions.list_functions import list_functions
from forgekeeper.functions.describe_function import describe_function
from forgekeeper.app.services.function_loader import load_functions
from forgekeeper.app.interpreter.prompt_mapper import interpret_prompt, wrap_prompt

# Load environment variables
dotenv_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path)

model_path = os.getenv("LLM_MODEL_PATH")
n_ctx = int(os.getenv("LLM_CONTEXT_SIZE", 2048))
n_gpu_layers = int(os.getenv("LLM_GPU_LAYERS", 0))
n_threads = int(os.getenv("LLM_THREADS", 4))
max_tokens = int(os.getenv("LLM_MAX_TOKENS", 512))

# Instantiate the LLaMA model
llm = Llama(
    model_path=model_path,
    n_ctx=n_ctx,
    n_threads=n_threads,
    n_gpu_layers=n_gpu_layers
)

# Setup
session_id = "session_001"
tools = load_functions()

def build_self_awareness_prompt():
    function_list = list_functions()
    descriptions = []
    for func in function_list:
        try:
            desc = describe_function(func)
        except Exception:
            desc = "No description available."
        descriptions.append(f"- **{func}**: {desc}")
    
    return """You are Forgekeeper, a self-extending AI capable of reading, modifying, and creating your own tools.

Your available function tools are:
""" + "\n".join(descriptions) + """

To use a function, respond with a line starting with:
call: function_name(arg1="value", arg2="value")

Forgekeeper, you are bold. Expand wisely.
"""

def try_execute_function_call(text, available_functions):
    match = re.search(r'call:\s*(\w+)\((.*?)\)', text)
    if not match:
        return None
    
    func_name, args_str = match.groups()
    if func_name not in available_functions:
        return f"[ERROR] Function '{func_name}' not found."
    
    try:
        args = eval(f"dict({args_str})")
        result = available_functions[func_name](**args)
        return f"[TOOL RESULT] {result}"
    except Exception as e:
        return f"[ERROR] Failed to execute {func_name}: {str(e)}"

# Start console chat
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)

log.info("🦇 ForgeKeeper Console Chat")
log.info("Type your message. End input with '<<END>>' on a new line. Type 'exit' to quit.\n")

conversation_history = [{"role": "system", "content": build_self_awareness_prompt()}]

while True:
    user_input = []
    line = input("You > ")
    while True:
        if line.strip().lower() == "exit":
            log.info("Goodbye!")
            exit(0)
        elif line.strip() == "<<END>>":
            break
        else:
            user_input.append(line)
        line = input()

    prompt = "\n".join(user_input).strip()
    if not prompt:
        continue

    save_message(session_id, "user", prompt, project_id=session_id)

    # First check: LLM-guided system intent
    interpreted_response = interpret_prompt(prompt, session_id, llm=llm)
    if interpreted_response:
        log.info("ForgeKeeper > %s", interpreted_response)
        save_message(session_id, "assistant", interpreted_response, project_id=session_id)
        continue

    # Otherwise proceed with standard chat handling
    conversation_history.append({"role": "user", "content": prompt})
    messages = [{"role": m["role"], "content": m["content"]} for m in conversation_history]

    # Get response from llama.cpp using messages interface
    try:
        output = llm.create_chat_completion(messages=messages, max_tokens=max_tokens)
        reply = output["choices"][0]["message"]["content"].strip()
    except Exception as e:
        reply = f"[ERROR] LLM failed: {str(e)}"

    log.info("ForgeKeeper > %s", reply)
    save_message(session_id, "assistant", reply, project_id=session_id)
    conversation_history.append({"role": "assistant", "content": reply})

    # Function calling post-processing
    tool_result = try_execute_function_call(reply, tools)
    if tool_result:
        log.info(tool_result)
        save_message(session_id, "function", tool_result, project_id=session_id)
        conversation_history.append({"role": "function", "content": tool_result})
