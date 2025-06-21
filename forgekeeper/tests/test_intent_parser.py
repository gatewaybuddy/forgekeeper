import os
from pathlib import Path
from forgekeeper.app.interpreter.intent_parser import extract_intent_with_llm
from forgekeeper.app.services.llm_service_llamacpp import llm

# Optional: redirect logs
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
