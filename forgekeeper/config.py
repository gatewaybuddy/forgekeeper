import os

# Global debug flag used across the project
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"
