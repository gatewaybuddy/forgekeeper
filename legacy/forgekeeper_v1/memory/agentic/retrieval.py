"""Very small in-memory retrieval provider using bag-of-words vectors."""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import List

from .base import RetrievalProvider

_WORD_RE = re.compile(r"\w+")


class InMemoryRetriever(RetrievalProvider):
    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path or ".forgekeeper/memory/index.json")
        self.items: List[dict] = []
        self.vectors: List[Counter[str]] = []
        if self.path.exists():
            data = json.loads(self.path.read_text())
            self.items = data.get("items", [])
            self.vectors = [Counter(d) for d in data.get("vectors", [])]

    # ------------------------------------------------------------------
    def _vectorize(self, text: str) -> Counter[str]:
        return Counter(_WORD_RE.findall(text.lower()))

    # ------------------------------------------------------------------
    def index(self, items: List[dict]) -> None:
        for item in items:
            text = item.get("text", "")
            self.items.append(item)
            self.vectors.append(self._vectorize(text))
        self._persist()

    # ------------------------------------------------------------------
    def _persist(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {"items": self.items, "vectors": [dict(v) for v in self.vectors]}
        self.path.write_text(json.dumps(data))

    # ------------------------------------------------------------------
    def search(self, query: str, k: int = 5) -> List[dict]:
        qv = self._vectorize(query)
        results: List[tuple[float, dict]] = []
        for item, vec in zip(self.items, self.vectors):
            score = self._cosine(qv, vec)
            if score > 0:
                results.append((score, item))
        results.sort(key=lambda x: -x[0])
        return [it for _, it in results[:k]]

    # ------------------------------------------------------------------
    @staticmethod
    def _cosine(a: Counter[str], b: Counter[str]) -> float:
        dot = sum(a[w] * b.get(w, 0) for w in a)
        na = math.sqrt(sum(v * v for v in a.values()))
        nb = math.sqrt(sum(v * v for v in b.values()))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)
