from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from forgekeeper.load_env import init_env

init_env()

from thoughts import summarize_thoughts
from forgekeeper.app.services.llm_router import (
    get_core_model_name,
    get_coder_model_name,
)

from forgekeeper.app.utils.json_helpers import extract_json
from forgekeeper.app.memory.retrieval import retrieve_similar_entries
from forgekeeper.app.services.prompt_formatting import build_memory_prompt
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.agents import route_intent, execute_next_task

log = get_logger(__name__, debug=DEBUG_MODE)

if __name__ == "__main__":
    core_model = get_core_model_name()
    coder_model = get_coder_model_name()
    log.info(
        f"\n🧪 Dual LLM Architecture: Core ({core_model}) + Coder ({coder_model})\n"
    )
    while True:
        lines = []
        line = input("You > ")
        while True:
            if line.strip().lower() == "exit":
                exit()
            elif line.strip().lower() == "summarize":
                log.info("\n🧠 Memory Summary:\n")
                log.info(summarize_thoughts())
                log.info("\n" + "-" * 50 + "\n")
                break
            elif line.strip().lower() == "nexttask":
                execute_next_task("session_kai")
                break
            elif line.strip() == "<<END>>":
                break
            lines.append(line)
            line = input()
            if line.strip().lower() == "exit":
                exit()
            elif line.strip().lower() == "summarize":
                log.info("\n🧠 Memory Summary:\n")
                log.info(summarize_thoughts())
                log.info("\n" + "-" * 50 + "\n")
                break
            elif line.strip().lower() == "nexttask":
                execute_next_task("session_kai")
                break
            elif line.strip() == "<<END>>":
                break
            lines.append(line)

        user_input = "\n".join(lines).strip()
        if user_input:
            output = route_intent(user_input, session_id="session_kai")
            log.info("\nForgeKeeper > %s", output)
            log.info("\n" + "-" * 50 + "\n")
