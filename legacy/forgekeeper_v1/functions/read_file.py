from forgekeeper.config import ENABLE_OUTBOX

if ENABLE_OUTBOX:
    try:  # pragma: no cover
        from forgekeeper import outbox
    except Exception:  # pragma: no cover
        outbox = None
else:  # pragma: no cover
    outbox = None


def _read(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    except Exception as e:  # pragma: no cover - simple wrapper
        return {"error": str(e)}


def read_file(path):
    """Read ``path`` returning contents with outbox logging if enabled."""
    if ENABLE_OUTBOX and outbox is not None:
        action = {
            "module": __name__,
            "function": "_read",
            "args": [path],
            "kwargs": {},
        }
        with outbox.pending_action(action):
            return _read(path)
    return _read(path)
