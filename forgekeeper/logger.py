"""Lightweight logging helpers for Forgekeeper."""

from __future__ import annotations

import logging
from typing import Optional

_LOGGER_CACHE: dict[str, logging.Logger] = {}


def get_logger(name: str = "forgekeeper", debug: bool = False, log_file: Optional[str] = None) -> logging.Logger:
    """Return a configured logger instance.

    The logger is cached per ``name`` and initialised with a simple formatter on
    first use. Additional calls return the cached logger so repeated setup is
    avoided.
    """

    if name in _LOGGER_CACHE:
        return _LOGGER_CACHE[name]

    logger = logging.getLogger(name)
    level = logging.DEBUG if debug else logging.INFO
    logger.setLevel(level)

    if not logger.handlers:
        formatter = logging.Formatter("[%(levelname)s] %(asctime)s - %(message)s", "%Y-%m-%d %H:%M:%S")
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        if log_file:
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)

    _LOGGER_CACHE[name] = logger
    return logger


__all__ = ["get_logger"]
