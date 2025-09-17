from __future__ import annotations

from forgekeeper.config import DEBUG_MODE
from forgekeeper.logger import get_logger
from forgekeeper.memory.episodic import append_entry

log = get_logger(__name__, debug=DEBUG_MODE)


def request_coder_update(task_description: str, session_id: str, task_id: str):
    """Send the task to the coder agent and parse the response."""
    coder_prompt = (
        "You are the Coder agent. Apply the following task to the repository:\n"
        f"{task_description}\n"
        "Respond with JSON containing 'file_path' and 'updated_code' representing"
        " the complete new file contents."
    )

    from . import ask_coder  # Local import to avoid circular dependency

    response = ask_coder(coder_prompt, session_id)
    try:
        from forgekeeper.app.utils.json_helpers import extract_json

        data = extract_json(response) if isinstance(response, str) else response
    except Exception as exc:  # pragma: no cover - defensive
        log.error(f"Failed to parse coder response: {exc}")
        append_entry(
            task_id,
            task_description,
            "parse-error",
            [],
            "Failed to parse coder response",
            [],
            "negative",
        )
        return None, ""

    file_path = data.get("file_path") if isinstance(data, dict) else None
    updated_code = data.get("updated_code", "") if isinstance(data, dict) else ""

    if not file_path:
        log.error("Coder response missing 'file_path'; aborting task.")
        append_entry(
            task_id,
            task_description,
            "no-file",
            [],
            "Coder response missing file path",
            [],
            "negative",
        )
        return None, ""

    return file_path, updated_code
