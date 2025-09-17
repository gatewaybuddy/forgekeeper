from __future__ import annotations

import math
import os
from typing import List

# Optional embedding backends -------------------------------------------------
try:  # pragma: no cover - exercised via stub in tests
    from sentence_transformers import SentenceTransformer

    _local_model = SentenceTransformer("all-MiniLM-L6-v2")
except Exception:  # pragma: no cover - optional dependency
    _local_model = None


def _get_embedding_backend():
    """Return a callable that embeds a list of texts."""

    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:  # pragma: no cover - network call avoided in tests
        import openai  # type: ignore

        client = openai.OpenAI(api_key=api_key)

        def _embed(texts: List[str]) -> List[List[float]]:
            resp = client.embeddings.create(
                input=texts, model="text-embedding-3-small"
            )
            return [d.embedding for d in resp.data]

        return _embed
    if _local_model is not None:
        return lambda texts: _local_model.encode(texts).tolist()

    # Fall back to a trivial bag-of-words embedding so imports never fail in
    # environments without external models.  This keeps tests lightweight.
    def _fallback(texts: List[str]) -> List[List[float]]:  # pragma: no cover
        return [[float(ord(c)) for c in t] for t in texts]

    return _fallback


embed = _get_embedding_backend()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Return cosine similarity between two vectors."""

    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
