"""Minimal user interface abstraction.

The actual Forgekeeper project may expose thoughts to a GUI or other medium.
For now, this module simply logs the message. It can be extended later with
richer interaction capabilities.
"""

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
