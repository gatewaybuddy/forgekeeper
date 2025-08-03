from flask import Blueprint, request, jsonify
from ..services.llm_service import ask_llm
from ..services.function_loader import load_functions
from ..utils.prompt_guard import verify_prompt

chat_bp = Blueprint('chat', __name__)
functions = load_functions()

@chat_bp.route("/ask", methods=["POST"])
def ask():
    data = request.json
    prompt = verify_prompt(data.get("prompt", ""))
    response = ask_llm(prompt)

    if isinstance(response, dict) and "function_call" in response:
        fn_name = response["function_call"]["name"]
        args = response["function_call"].get("arguments", {})
        fn = functions.get(fn_name)
        if fn:
            return jsonify({"result": fn(**args)})
        return jsonify({"error": "Function not found"}), 404

    return jsonify({"response": response})