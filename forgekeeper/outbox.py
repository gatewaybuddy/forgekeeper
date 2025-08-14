from __future__ import annotations

"""Lightweight outbox for persisting tool actions before execution."""

import importlib
import json
import uuid
from contextlib import contextmanager
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


def run_action(action: Dict[str, Any]) -> Any:
    """Execute an action dictionary using ``module`` and ``function`` keys."""
    module_name = action.get("module")
    func_name = action.get("function")
    args = action.get("args", [])
    kwargs = action.get("kwargs", {})
    if not module_name or not func_name:
        raise ValueError("Action missing module or function")
    module = importlib.import_module(module_name)
    func = getattr(module, func_name)
    return func(*args, **kwargs)


@contextmanager
def pending_action(action: Dict[str, Any]):
    """Context manager writing ``action`` before execution."""
    path = write_action(action)
    try:
        yield
        remove_action(path)
    except Exception:
        # leave file for future replay
        raise

def replay_pending(executor: Callable[[Dict[str, Any]], Any] = run_action) -> None:
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
