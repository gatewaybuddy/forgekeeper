import os
import sys
import logging
# from forgekeeper.app.services.llm_service import ask_llm
from forgekeeper.app.services.llm_service_llamacpp import ask_llm
from forgekeeper.app.services.code_catcher import auto_write_functions_from_response

DEBUG_MODE = "--debug" in sys.argv

if DEBUG_MODE:
    logging.basicConfig(level=logging.DEBUG)
else:
    logging.basicConfig(level=logging.WARNING)
# # Configure root logger to INFO (chat stays clean)
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(levelname)s:%(name)s:%(message)s"
# )
# logger = logging.getLogger(__name__)
# logger.setLevel(logging.INFO)

print("🦇 ForgeKeeper Console Chat")
print("Type your message. End input with '<<END>>' on a new line. Type 'exit' to quit.\n")

while True:
    print("You > ", end="")
    lines = []
    # while True:
    #     line = input()
    #     if line.strip() == "<<END>>":
    #         break
    #     lines.append(line)
    # prompt = "\n".join(lines).strip()
    # if prompt.lower() == "exit":
    #     break
    if __name__ == "__main__":
        print("🦇 ForgeKeeper Console Chat")
        prompt = input("You > ").strip()
        result = ask_llm(prompt)
        print("Kai >", result.get("response", result))


    try:
        response = ask_llm(prompt)
        if isinstance(response, dict) and "response" in response:
            print(f'Kai > {response["response"]}')
            written = auto_write_functions_from_response(response["response"])
            if written:
                print(f"📝 Saved: {', '.join(written)}")
        elif isinstance(response, dict):
            print(f'Kai > {response}')
        else:
            print(f'Kai > {response}')
    except Exception as e:
        print(f"Kai > Error: {e}")
