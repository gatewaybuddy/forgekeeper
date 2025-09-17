import logging
from typing import Optional, Dict

_logger_cache: Dict[str, logging.Logger] = {}


def get_logger(name: str = "forgekeeper", debug: bool = False, log_file: Optional[str] = None) -> logging.Logger:
    """Return a configured logger.

    Parameters
    ----------
    name : str
        Logger name.
    debug : bool
        If True, set level to DEBUG, else INFO.
    log_file : str | None
        Optional file to also write logs to.
    """
    if name in _logger_cache:
        return _logger_cache[name]

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

    _logger_cache[name] = logger
    return logger
