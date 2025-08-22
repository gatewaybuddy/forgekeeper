from __future__ import annotations

import json
import math
from collections import Counter
from typing import Dict, List, Optional

class SimpleTfidfVectorizer:
    """Minimal TF-IDF vectorizer with JSON (de)serialization."""

    def __init__(self, vocab: Optional[List[str]] = None, idf: Optional[List[float]] = None) -> None:
        self.vocab = vocab or []
        self.idf = idf or []

    def fit(self, texts: List[str]) -> None:
        docs = [t.lower().split() for t in texts]
        N = len(docs)
        df: Dict[str, int] = {}
        for words in docs:
            for w in set(words):
                df[w] = df.get(w, 0) + 1
        self.vocab = sorted(df.keys())
        self.idf = [math.log(N / (1 + df[w])) for w in self.vocab]

    def transform(self, texts: List[str]) -> List[List[float]]:
        vectors: List[List[float]] = []
        for text in texts:
            words = text.lower().split()
            counts = Counter(words)
            length = len(words) or 1
            vec: List[float] = []
            for w, idf in zip(self.vocab, self.idf):
                tf = counts.get(w, 0) / length
                vec.append(tf * idf)
            vectors.append(vec)
        return vectors

    def fit_transform(self, texts: List[str]) -> List[List[float]]:
        self.fit(texts)
        return self.transform(texts)

    def to_json(self) -> str:
        return json.dumps({"vocab": self.vocab, "idf": self.idf})

    @classmethod
    def from_json(cls, data: str) -> "SimpleTfidfVectorizer":
        obj = json.loads(data)
        return cls(obj["vocab"], obj["idf"])


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Return cosine similarity between two vectors."""
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
