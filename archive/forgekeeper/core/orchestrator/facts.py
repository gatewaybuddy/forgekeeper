"""Simple JSON-backed facts store for orchestrator context."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


class FactsStore:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else None
        self._data: dict[str, Any] = {}
        self._corrections: list[dict[str, Any]] = []
        if self.path and self.path.exists():
            try:
                payload = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                payload = {}
            self._data = dict(payload.get("data", {}))
            self._corrections = list(payload.get("corrections", []))

    def upsert(self, key: str, value: Any) -> None:
        self._data[key] = value
        self._save()

    def get(self, key: str, default: Optional[Any] = None) -> Any:
        return self._data.get(key, default)

    def items(self) -> list[tuple[str, Any]]:
        return list(self._data.items())

    def correct(self, key: str, new_value: Any, note: str = "") -> None:
        old = self._data.get(key)
        self._corrections.append({"key": key, "old": old, "new": new_value, "note": note})
        self._data[key] = new_value
        self._save()

    def _save(self) -> None:
        if not self.path:
            return
        payload = {"data": self._data, "corrections": self._corrections}
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


__all__ = ["FactsStore"]
