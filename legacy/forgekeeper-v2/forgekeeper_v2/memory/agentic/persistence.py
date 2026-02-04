from __future__ import annotations

from pathlib import Path
import json
from typing import Any


class AgenticStore:
    def __init__(self, path: Path | str = Path(".forgekeeper/agentic_memory.json")) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text(json.dumps({"feedback": [], "facts": {}}, indent=2), encoding="utf-8")

    def _load(self) -> dict[str, Any]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return {"feedback": [], "facts": {}}

    def _save(self, data: dict[str, Any]) -> None:
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def append_feedback(self, item: dict[str, Any]) -> None:
        data = self._load()
        data.setdefault("feedback", []).append(item)
        self._save(data)

    def set_fact(self, key: str, value: Any) -> None:
        data = self._load()
        data.setdefault("facts", {})[key] = value
        self._save(data)

    def get_fact(self, key: str, default: Any = None) -> Any:
        return self._load().get("facts", {}).get(key, default)

    def recent_feedback(self, limit: int = 20) -> list[dict[str, Any]]:
        return list(self._load().get("feedback", []))[-limit:]
