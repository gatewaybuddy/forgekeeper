import json
from pathlib import Path


def save_state(state: dict, path: str = "forgekeeper/state.json") -> None:
    """Persist the given state dictionary to disk."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def load_state(path: str = "forgekeeper/state.json") -> dict:
    """Load state dictionary from disk. Return empty dict if file is missing."""
    path = Path(path)
    if not path.is_file():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return {}
