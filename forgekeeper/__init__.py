# Forgekeeper package
from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)

try:  # best effort to replay pending actions and start worker on import
    from .config import ENABLE_OUTBOX
    if ENABLE_OUTBOX:
        from .outbox import replay_pending, run_action
        from .outbox_worker import run_worker
        import asyncio
        from threading import Thread

        replay_pending(run_action)

        def _worker() -> None:  # pragma: no cover - background thread
            asyncio.run(run_worker())

        Thread(target=_worker, daemon=True).start()
except Exception:  # pragma: no cover - replay failures shouldn't break import
    pass
