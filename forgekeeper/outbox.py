from __future__ import annotations

"""Lightweight outbox for persisting tool actions before execution."""

import json
import uuid
from pathlib import Path
from typing import Any, Callable, Dict

OUTBOX_PATH = Path(__file__).resolve().parent / "outbox"
OUTBOX_PATH.mkdir(exist_ok=True)

def write_action(action: Dict[str, Any]) -> Path:
    """Persist ``action`` to disk and return its file path."""
    action_id = uuid.uuid4().hex
    path = OUTBOX_PATH / f"{action_id}.json"
    path.write_text(json.dumps(action), encoding="utf-8")
    return path

def remove_action(path: Path) -> None:
    """Remove persisted action file if it exists."""
    try:
        path.unlink()
    except FileNotFoundError:
        pass

def replay_pending(executor: Callable[[Dict[str, Any]], Any]) -> None:
    """Replay unfinished actions using ``executor``.

    Each JSON file in the outbox directory represents a pending tool call. The
    ``executor`` is invoked for each action; if it succeeds, the file is
    deleted. Failures leave the file for a future replay attempt.
    """
    for path in list(OUTBOX_PATH.glob("*.json")):
        try:
            call = json.loads(path.read_text(encoding="utf-8"))
            executor(call)
            path.unlink()
        except Exception:
            # Leave file in place for later replays
            continue
