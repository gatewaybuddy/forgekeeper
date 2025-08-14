# Forgekeeper package
from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)

try:  # best effort to replay pending actions on import
    from .config import ENABLE_OUTBOX
    if ENABLE_OUTBOX:
        from .outbox import replay_pending, run_action

        replay_pending(run_action)
except Exception:  # pragma: no cover - replay failures shouldn't break import
    pass
