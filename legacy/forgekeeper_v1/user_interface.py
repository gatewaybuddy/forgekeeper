"""Minimal user interface abstraction.

The actual Forgekeeper project may expose thoughts to a GUI or other medium.
For now, this module simply logs the message. It can be extended later with
richer interaction capabilities.
"""

from typing import Any, Dict

from .logger import get_logger

_logger = get_logger("user_interface")


def expose(text: str) -> None:
    """Expose the given text to the user interface.

    Parameters
    ----------
    text : str
        The text to display or otherwise expose to the user.
    """
    _logger.info("USER NOTICE: %s", text)


def display_check_results(report: Dict[str, Any]) -> None:
    """Render commit check results to the user interface."""

    expose(report.get("summary", ""))
    for fname, info in report.get("highlights", {}).items():
        diff_text = info.get("diff", "").strip()
        if diff_text:
            expose(f"Diff for {fname}:\n{diff_text}")
        for msg in info.get("messages", []):
            expose(f"{fname}: {msg}")
