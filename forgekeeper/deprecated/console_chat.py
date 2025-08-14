import os
import sys
import logging
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
# from forgekeeper.app.services.llm_service import ask_llm
from forgekeeper.llm.llm_service_vllm import ask_llm
from forgekeeper.app.services.code_catcher import auto_write_functions_from_response

CLI_DEBUG = "--debug" in sys.argv

if CLI_DEBUG:
    logging.basicConfig(level=logging.DEBUG)
else:
    logging.basicConfig(level=logging.WARNING)

log = get_logger(__name__, debug=DEBUG_MODE or CLI_DEBUG)
# # Configure root logger to INFO (chat stays clean)
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(levelname)s:%(name)s:%(message)s"
# )
# logger = logging.getLogger(__name__)
# logger.setLevel(logging.INFO)

log.info("🦇 ForgeKeeper Console Chat")
log.info("Type your message. End input with '<<END>>' on a new line. Type 'exit' to quit.\n")

while True:
    prompt = input("You > ").strip()

    if __name__ == "__main__":
        log.info("🦇 ForgeKeeper Console Chat")
        result = ask_llm(prompt)
        log.info("Kai > %s", result.get("response", result))


    try:
        response = ask_llm(prompt)
        if isinstance(response, dict) and "response" in response:
            log.info('Kai > %s', response["response"])
            written = auto_write_functions_from_response(response["response"])
            if written:
                log.info("📝 Saved: %s", ', '.join(written))
        elif isinstance(response, dict):
            log.info('Kai > %s', response)
        else:
            log.info('Kai > %s', response)
    except Exception as e:
        log.error("Kai > Error: %s", e)
