from __future__ import annotations

"""Asynchronous worker processing JSON actions from the outbox directory."""

import asyncio
import json
import time
from pathlib import Path
from typing import Dict

from .logger import get_logger
from .outbox import OUTBOX_PATH, run_action

BASE_DELAY = 1.0
MAX_DELAY = 60.0

async def run_worker(poll_interval: float = 1.0) -> None:
    """Continuously execute pending outbox actions with retries.

    Parameters
    ----------
    poll_interval : float
        Seconds to wait between directory scans.
    """
    logger = get_logger("forgekeeper.outbox_worker")
    attempts: Dict[Path, int] = {}
    next_attempt: Dict[Path, float] = {}

    try:
        while True:
            now = time.time()
            for path in list(OUTBOX_PATH.glob("*.json")):
                if next_attempt.get(path, 0) > now:
                    continue
                try:
                    call = json.loads(path.read_text(encoding="utf-8"))
                    run_action(call)
                    path.unlink()
                    attempts.pop(path, None)
                    next_attempt.pop(path, None)
                    logger.info("Action %s succeeded", path.name)
                except Exception as exc:  # pragma: no cover - log path
                    attempt = attempts.get(path, 0) + 1
                    attempts[path] = attempt
                    delay = min(MAX_DELAY, BASE_DELAY * 2 ** (attempt - 1))
                    next_attempt[path] = now + delay
                    logger.warning(
                        "Action %s failed on attempt %d: %s. Retrying in %.1fs",
                        path.name,
                        attempt,
                        exc,
                        delay,
                    )
            await asyncio.sleep(poll_interval)
    except asyncio.CancelledError:
        logger.info("Outbox worker cancelled")
        raise


if __name__ == "__main__":  # pragma: no cover - manual execution
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        pass
