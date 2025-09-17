from __future__ import annotations

"""Asynchronous worker processing JSON actions from the outbox directory."""

import asyncio
import json
import time
from pathlib import Path
from typing import Dict

from .logger import get_logger
from .outbox import OUTBOX_PATH, run_action
from .telemetry import log_outbox_metrics
from .config import (
    OUTBOX_BASE_DELAY,
    OUTBOX_MAX_DELAY,
    OUTBOX_POLL_INTERVAL,
)

BASE_DELAY = OUTBOX_BASE_DELAY
MAX_DELAY = OUTBOX_MAX_DELAY

async def run_worker(
    poll_interval: float = OUTBOX_POLL_INTERVAL,
    base_delay: float = BASE_DELAY,
    max_delay: float = MAX_DELAY,
) -> None:
    """Continuously execute pending outbox actions with retries.

    Parameters
    ----------
    poll_interval : float
        Seconds to wait between directory scans.
    base_delay : float
        Initial delay for retry backoff.
    max_delay : float
        Maximum delay for retry backoff.
    """
    logger = get_logger("forgekeeper.outbox_worker")
    attempts: Dict[Path, int] = {}
    next_attempt: Dict[Path, float] = {}
    processed = 0
    retries = 0

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
                    processed += 1
                    logger.info("Action %s succeeded", path.name)
                    log_outbox_metrics(processed, retries)
                except Exception as exc:  # pragma: no cover - log path
                    attempt = attempts.get(path, 0) + 1
                    attempts[path] = attempt
                    delay = min(max_delay, base_delay * 2 ** (attempt - 1))
                    next_attempt[path] = now + delay
                    retries += 1
                    logger.warning(
                        "Action %s failed on attempt %d: %s. Retrying in %.1fs",
                        path.name,
                        attempt,
                        exc,
                        delay,
                    )
                    log_outbox_metrics(processed, retries)
            await asyncio.sleep(poll_interval)
    except asyncio.CancelledError:
        logger.info("Outbox worker cancelled")
        raise


if __name__ == "__main__":  # pragma: no cover - manual execution
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        pass
