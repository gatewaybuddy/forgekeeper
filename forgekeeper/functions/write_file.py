from forgekeeper.config import ENABLE_OUTBOX

if ENABLE_OUTBOX:
    try:  # pragma: no cover - optional
        from forgekeeper import outbox
    except Exception:  # pragma: no cover
        outbox = None
else:  # pragma: no cover
    outbox = None


def _write(path, content):
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"result": "success"}
    except Exception as e:  # pragma: no cover - simple wrapper
        return {"error": str(e)}


def write_file(path, content):
    """Writes content to ``path`` persisting action via outbox if enabled."""
    if ENABLE_OUTBOX and outbox is not None:
        action = {
            "module": __name__,
            "function": "_write",
            "args": [path, content],
            "kwargs": {},
        }
        with outbox.pending_action(action):
            return _write(path, content)
    return _write(path, content)
