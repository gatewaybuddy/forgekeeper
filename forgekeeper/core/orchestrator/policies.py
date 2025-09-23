"""Floor/trigger policies for orchestrator turn-taking."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, Optional


def _now() -> float:
    return time.monotonic()


@dataclass
class TriggerPolicy:
    max_latency_s: float = 1.0
    max_tokens: int = 200
    min_silence_s: float = 0.2
    delta_threshold: float = 1.0
    semantic_delta_fn: Optional[Callable[[], float]] = None

    _last_emit: float = 0.0
    _last_activity: float = 0.0
    _hysteresis: float = 1.0

    def activity(self) -> None:
        self._last_activity = _now()

    def should_emit(self, now: Optional[float] = None) -> bool:
        now = now or _now()
        if now - self._last_emit >= self.max_latency_s:
            return True
        if now - self._last_activity < self.min_silence_s:
            return False
        delta = 0.0
        if self.semantic_delta_fn:
            try:
                delta = self.semantic_delta_fn()
            except Exception:
                delta = 0.0
        return delta * self._hysteresis >= self.delta_threshold

    def mark_emitted(self, now: Optional[float] = None) -> None:
        now = now or _now()
        self._last_emit = now
        self._hysteresis *= 1.15

    def decay(self) -> None:
        self._hysteresis = 1.0 + (self._hysteresis - 1.0) * 0.5


@dataclass
class FloorPolicy:
    slice_ms: int = 600
    _last: str = "botB"
    user_active_deadline: float = 0.0

    def mark_user_active(self) -> None:
        self.user_active_deadline = _now() + 1.5

    def is_user_active(self) -> bool:
        return _now() < self.user_active_deadline

    def next_speaker(self) -> str:
        if self.is_user_active():
            return "user"
        self._last = "botA" if self._last == "botB" else "botB"
        return self._last


__all__ = ["TriggerPolicy", "FloorPolicy"]
