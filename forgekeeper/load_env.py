import os
from dotenv import load_dotenv
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)

def init_env():
    # Always resolve from the project root where .env actually exists
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    dotenv_path = os.path.join(base_dir, '.env')
    load_dotenv(dotenv_path)

    # Debug output
    log.debug("Resolved .env path: %s", dotenv_path)
    log.debug("LLM_BACKEND (after load): %s", os.getenv("LLM_BACKEND"))
