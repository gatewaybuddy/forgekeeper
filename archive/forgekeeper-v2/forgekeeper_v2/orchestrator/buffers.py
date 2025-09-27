from __future__ import annotations

from collections import deque
from typing import Any, Deque, List

from .events import Event


class Buffers:
    def __init__(self, maxlen: int = 1000) -> None:
        self.B_raw: Deque[Event] = deque(maxlen=maxlen)
        self.S_running: List[str] = []
        self.K_facts: dict[str, Any] = {}

    def append(self, ev: Event) -> None:
        self.B_raw.append(ev)

    def window_since(self, min_seq: int) -> list[Event]:
        return [e for e in self.B_raw if e.seq > min_seq]

