import os

# Global debug flag used across the project
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"

# Pre-commit check configuration
RUN_COMMIT_CHECKS = os.getenv(
    "FORGEKEEPER_RUN_COMMIT_CHECKS", "true"
).lower() == "true"

_checks = os.getenv("FORGEKEEPER_COMMIT_CHECKS")
if _checks:
    COMMIT_CHECKS = [cmd.strip() for cmd in _checks.split(",") if cmd.strip()]
else:
    COMMIT_CHECKS = ["pytest", "flake8"]
