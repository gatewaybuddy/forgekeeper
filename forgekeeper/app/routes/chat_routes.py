from flask import Blueprint, request, jsonify
from ..services.llm_service import ask_llm
from ..services.function_loader import load_functions
from ..utils.prompt_guard import verify_prompt
from ..utils.harmony_parser import parse_harmony_tool_call
import ast
import re

chat_bp = Blueprint('chat', __name__)
functions = load_functions()

_INLINE_CALL_RE = re.compile(r"call:\s*(\w+)\(([^)]*)\)", re.IGNORECASE)


def parse_inline_call(text):
    """Parse calls of the form ``call: func(arg=value)``.

    Returns a dict with ``name`` and ``arguments`` keys or ``None`` if the
    pattern is not found. Argument values are parsed with
    :func:`ast.literal_eval` for safety.
    """
    match = _INLINE_CALL_RE.search(text)
    if not match:
        return None
    name = match.group(1)
    arg_src = match.group(2).strip()
    arguments = {}
    if arg_src:
        for part in arg_src.split(','):
            if '=' not in part:
                continue
            key, val = part.split('=', 1)
            key = key.strip()
            val = val.strip()
            try:
                arguments[key] = ast.literal_eval(val)
            except Exception:
                arguments[key] = val.strip("'\"")
    return {"name": name, "arguments": arguments}

@chat_bp.route("/ask", methods=["POST"])
def ask():
    data = request.json
    prompt = verify_prompt(data.get("prompt", ""))
    response = ask_llm(prompt)

    # Process both OpenAI-style function_call dicts and Harmony action tokens
    call = None
    if isinstance(response, dict) and "function_call" in response:
        call = response["function_call"]
    elif isinstance(response, str):
        call = parse_harmony_tool_call(response) or parse_inline_call(response)

    if call:
        fn_name = call["name"]
        args = call.get("arguments", {})
        fn = functions.get(fn_name)
        if fn:
            return jsonify({"result": fn(**args)})
        return jsonify({"error": "Function not found"}), 404

    return jsonify({"response": response})
