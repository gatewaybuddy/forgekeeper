import os
import sys
from pathlib import Path

# Ensure project root is on the path when running via pytest
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

# Skip if llama_cpp is unavailable to avoid heavy dependency during tests
import pytest
pytest.importorskip("llama_cpp")


from app.interpreter.intent_parser import extract_intent_with_llm
from app.services.llm_service_llamacpp import llm


def test_extract_intent_basic():
    """Basic smoke test to ensure the intent parser returns a result."""
    result = extract_intent_with_llm(llm, "Hello")
    assert result is not None


if __name__ == "__main__":
    log = get_logger(__name__, debug=DEBUG_MODE, log_file="intent_test_log.txt")
    log.info("🧪 ForgeKeeper Intent Parser Test")
    log.info("Type your test prompt. End with '<<END>>'. Type 'exit' to quit.\n")

    while True:
        lines = []
        line = input("Prompt > ")
        while True:
            if line.strip().lower() == "exit":
                log.info("Goodbye!")
                exit(0)
            elif line.strip() == "<<END>>":
                break
            lines.append(line)
            line = input()

        user_input = "\n".join(lines).strip()
        if not user_input:
            continue

        log.info(f"\n🧠 Testing: {user_input}")
        intent = extract_intent_with_llm(llm, user_input)
        log.info(f"[RAW RESULT]:\n{intent}\n")

        if isinstance(intent, dict):
            if "action" in intent:
                log.info(f"[✅ ACTION DETECTED]: {intent['action']}")
            else:
                log.error("[❌ ERROR]: No action key in response.")
        else:
            log.error("[❌ ERROR]: Intent was not a dictionary.")
