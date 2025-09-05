"""Tiny helper for metrics and ops logging."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

_BASE = Path(".forgekeeper/memory")
_METRICS = _BASE / "metrics.json"
_OPS = _BASE / "ops.jsonl"

_metrics_cache: Dict[str, Dict[str, int]] | None = None


def _load() -> Dict[str, Dict[str, int]]:
    global _metrics_cache
    if _metrics_cache is not None:
        return _metrics_cache
    if _METRICS.exists():
        _metrics_cache = json.loads(_METRICS.read_text())
    else:
        _metrics_cache = {}
    return _metrics_cache


def _save(metrics: Dict[str, Dict[str, int]]) -> None:
    _BASE.mkdir(parents=True, exist_ok=True)
    _METRICS.write_text(json.dumps(metrics, indent=2))


def increment(agent_id: str, field: str) -> None:
    metrics = _load()
    agent_metrics = metrics.setdefault(
        agent_id, {"proposed": 0, "applied": 0, "reverted": 0}
    )
    agent_metrics[field] = agent_metrics.get(field, 0) + 1
    _save(metrics)


def append_op(record: dict) -> None:
    _BASE.mkdir(parents=True, exist_ok=True)
    with _OPS.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")


def snapshot() -> Dict[str, Dict[str, int]]:
    return _load().copy()
