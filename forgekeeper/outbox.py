"""Filesystem-backed outbox for pending tool actions."""

from __future__ import annotations

import importlib
import json
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Dict

OUTBOX_DIR = Path(".forgekeeper/outbox")
OUTBOX_DIR.mkdir(parents=True, exist_ok=True)


def _action_path(action_id: str) -> Path:
    return OUTBOX_DIR / f"{action_id}.json"


def write_action(action: Dict[str, Any]) -> Path:
    path = _action_path(uuid.uuid4().hex)
    path.write_text(json.dumps(action), encoding="utf-8")
    return path


def remove_action(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def run_action(action: Dict[str, Any]) -> Any:
    module_name = action.get("module")
    func_name = action.get("function")
    args = action.get("args", [])
    kwargs = action.get("kwargs", {})
    if not module_name or not func_name:
        raise ValueError("Action missing module/function")
    module = importlib.import_module(module_name)
    func = getattr(module, func_name)
    return func(*args, **kwargs)


@contextmanager
def pending_action(action: Dict[str, Any]):
    path = write_action(action)
    try:
        yield
        remove_action(path)
    except Exception:
        raise


def replay_pending(executor: Callable[[Dict[str, Any]], Any] = run_action) -> None:
    for path in sorted(OUTBOX_DIR.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            executor(payload)
            path.unlink()
        except Exception:
            continue


__all__ = ["pending_action", "write_action", "remove_action", "run_action", "replay_pending"]
