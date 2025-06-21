import os
from dotenv import load_dotenv

def init_env():
    # Always resolve from the project root where .env actually exists
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    dotenv_path = os.path.join(base_dir, '.env')
    load_dotenv(dotenv_path)

    # Debug output
    print("Resolved .env path:", dotenv_path)
    print("LLM_BACKEND (after load):", os.getenv("LLM_BACKEND"))
