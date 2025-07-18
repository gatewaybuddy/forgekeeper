import os
import sys
from pathlib import Path

# Skip if llama_cpp is unavailable to avoid heavy dependency during tests
import pytest
pytest.importorskip("llama_cpp")

# Ensure project root is on the path when running via pytest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.interpreter.intent_parser import extract_intent_with_llm
from app.services.llm_service_llamacpp import llm


def test_extract_intent_basic():
    """Basic smoke test to ensure the intent parser returns a result."""
    result = extract_intent_with_llm(llm, "Hello")
    assert result is not None


if __name__ == "__main__":
    # Optional: redirect logs when running interactively
    log_path = Path("intent_test_log.txt")
    log_file = open(log_path, "w", encoding="utf-8")

    def log(text):
        print(text)
        log_file.write(text + "\n")

    print("🧪 ForgeKeeper Intent Parser Test")
    print("Type your test prompt. End with '<<END>>'. Type 'exit' to quit.\n")

    while True:
        print("Prompt > ", end="")
        lines = []
        while True:
            line = input()
            if line.strip().lower() == "exit":
                log("Goodbye!")
                log_file.close()
                exit(0)
            elif line.strip() == "<<END>>":
                break
            lines.append(line)

        user_input = "\n".join(lines).strip()
        if not user_input:
            continue

        log(f"\n🧠 Testing: {user_input}")
        intent = extract_intent_with_llm(llm, user_input)
        log(f"[RAW RESULT]:\n{intent}\n")

        if isinstance(intent, dict):
            if "action" in intent:
                log(f"[✅ ACTION DETECTED]: {intent['action']}")
            else:
                log("[❌ ERROR]: No action key in response.")
        else:
            log("[❌ ERROR]: Intent was not a dictionary.")
