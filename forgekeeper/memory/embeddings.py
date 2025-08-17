from __future__ import annotations
import json
import math
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DB_PATH = Path('.forgekeeper/vectors.sqlite')
# Separate store for episodic memory summaries
EPISODIC_DB_PATH = Path('.forgekeeper/episodic_vectors.sqlite')
EPISODIC_PATH = Path('.forgekeeper/memory/episodic.jsonl')


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
            vec = []
            for w, idf in zip(self.vocab, self.idf):
                tf = counts.get(w, 0) / length
                vec.append(tf * idf)
            vectors.append(vec)
        return vectors

    def fit_transform(self, texts: List[str]) -> List[List[float]]:
        self.fit(texts)
        return self.transform(texts)

    def to_json(self) -> str:
        return json.dumps({'vocab': self.vocab, 'idf': self.idf})

    @classmethod
    def from_json(cls, data: str) -> 'SimpleTfidfVectorizer':
        obj = json.loads(data)
        return cls(obj['vocab'], obj['idf'])


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


class LocalEmbedder:
    """Local embedding helper storing vectors in SQLite."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(exist_ok=True)
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            self.vectorizer: Optional[SimpleTfidfVectorizer] = None
            self.mode = 'st'
        except Exception:
            self.model = None
            self.vectorizer = None
            self.mode = 'tfidf'

    # ------------------------------------------------------------------
    def _ensure_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS embeddings (path TEXT PRIMARY KEY, vector TEXT)')
            conn.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)')

    # ------------------------------------------------------------------
    def store_embeddings(self, mapping: Dict[str, str]) -> None:
        """Generate and persist embeddings for mapping of path -> text."""
        texts = list(mapping.values())
        if self.mode == 'st':
            vectors = self.model.encode(texts).tolist()  # type: ignore[union-attr]
        else:
            self.vectorizer = SimpleTfidfVectorizer()
            vectors = self.vectorizer.fit_transform(texts)
        self._ensure_db()
        with sqlite3.connect(self.db_path) as conn:
            conn.executemany(
                'REPLACE INTO embeddings(path, vector) VALUES (?, ?)',
                [(path, json.dumps(vec)) for path, vec in zip(mapping.keys(), vectors)],
            )
            if self.mode == 'tfidf' and self.vectorizer:
                conn.execute(
                    'REPLACE INTO meta(key, value) VALUES (?, ?)',
                    ('tfidf_vectorizer', self.vectorizer.to_json()),
                )
            conn.commit()

    # ------------------------------------------------------------------
    def get_embedding(self, path: str) -> Optional[List[float]]:
        self._ensure_db()
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute('SELECT vector FROM embeddings WHERE path=?', (path,)).fetchone()
        if row:
            return json.loads(row[0])
        return None

    # ------------------------------------------------------------------
    def _load_vectorizer(self) -> None:
        if self.vectorizer or self.mode != 'tfidf':
            return
        self._ensure_db()
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute('SELECT value FROM meta WHERE key=?', ('tfidf_vectorizer',)).fetchone()
        if row:
            self.vectorizer = SimpleTfidfVectorizer.from_json(row[0])
        else:
            self.vectorizer = SimpleTfidfVectorizer()

    # ------------------------------------------------------------------
    def embed_query(self, text: str) -> List[float]:
        if self.mode == 'st':
            return self.model.encode([text]).tolist()[0]  # type: ignore[union-attr]
        self._load_vectorizer()
        return self.vectorizer.transform([text])[0]  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
def load_episodic_memory(
    mem_path: Path = EPISODIC_PATH, db_path: Path | None = None
) -> Tuple[LocalEmbedder, Dict[str, Dict[str, object]]]:
    """Load episodic summaries, store their embeddings, and return stats.

    Parameters
    ----------
    mem_path:
        Path to the JSONL file containing episodic memory entries.
    db_path:
        Optional SQLite database path used for embedding storage.  When not
        provided the database is created alongside ``mem_path`` so test runs
        remain self‑contained.

    Returns
    -------
    Tuple of ``(embedder, summary_stats)`` where ``summary_stats`` maps a task
    identifier to a dictionary with ``success``, ``failure``, ``positive_sentiment``,
    ``negative_sentiment`` and ``summary`` fields.
    """

    mem_path = Path(mem_path)
    if db_path is None:
        # mem_path -> .forgekeeper/memory/episodic.jsonl
        # embeddings live one directory up: .forgekeeper/episodic_vectors.sqlite
        db_path = mem_path.parent.parent / "episodic_vectors.sqlite"

    summary: Dict[str, Dict[str, object]] = {}
    to_store: Dict[str, str] = {}
    if mem_path.is_file():
        for line in mem_path.read_text(encoding="utf-8").splitlines():
            try:
                data = json.loads(line)
            except Exception:
                continue
            key = str(data.get("task_id") or data.get("title") or "").strip()
            if not key:
                continue
            status = str(data.get("status", ""))
            sentiment = str(data.get("sentiment", "")).lower()
            summary_text = str(data.get("summary") or data.get("title") or "")
            stats = summary.setdefault(
                key,
                {
                    "success": 0,
                    "failure": 0,
                    "positive_sentiment": 0,
                    "negative_sentiment": 0,
                    "summary": summary_text,
                },
            )
            if "success" in status or status == "committed":
                stats["success"] = int(stats.get("success", 0)) + 1
            elif "fail" in status or "error" in status or status == "no-file":
                stats["failure"] = int(stats.get("failure", 0)) + 1
            if sentiment == "positive":
                stats["positive_sentiment"] = int(
                    stats.get("positive_sentiment", 0)
                ) + 1
            elif sentiment == "negative":
                stats["negative_sentiment"] = int(
                    stats.get("negative_sentiment", 0)
                ) + 1
            if summary_text:
                stats["summary"] = summary_text
                to_store[key] = summary_text

    embedder = LocalEmbedder(db_path)
    if to_store:
        embedder.store_embeddings(to_store)
    return embedder, summary


def retrieve_similar_tasks(
    text: str,
    summary_stats: Dict[str, Dict[str, object]],
    embedder: LocalEmbedder,
    top_n: int = 3,
) -> List[Tuple[str, Dict[str, object], float]]:
    """Return ``top_n`` episodic tasks most similar to ``text``.

    The ``summary_stats`` mapping should contain the episodic memory entries as
    produced by :func:`load_episodic_memory`. This helper embeds the ``text``
    query, computes cosine similarity against the stored vectors, and returns a
    list of ``(key, stats, similarity)`` tuples sorted from most to least
    similar. Entries with a non-positive similarity are skipped.
    """

    try:
        query_vec = embedder.embed_query(text)
    except Exception:
        return []
    scored: List[Tuple[str, Dict[str, object], float]] = []
    for key, stats in summary_stats.items():
        vec = embedder.get_embedding(key)
        if not vec:
            continue
        sim = cosine_similarity(query_vec, vec)
        if sim <= 0:
            continue
        scored.append((key, stats, sim))
    scored.sort(key=lambda x: x[2], reverse=True)
    return scored[:top_n]


def similar_task_summaries(
    text: str,
    summary_stats: Dict[str, Dict[str, object]],
    embedder: LocalEmbedder,
    top_n: int = 3,
    *,
    similar: Optional[List[Tuple[str, Dict[str, object], float]]] = None,
) -> List[str]:
    """Return summaries of tasks semantically similar to ``text``.

    Parameters
    ----------
    text:
        Query text describing the current task or goal.
    summary_stats:
        Mapping of episodic memory entries as produced by
        :func:`load_episodic_memory`.
    embedder:
        Embedder instance used to generate query vectors.
    top_n:
        Maximum number of summaries to return.
    similar:
        Optional precomputed list from :func:`retrieve_similar_tasks` to avoid
        recomputing similarities.

    Returns
    -------
    List[str]
        Summaries for the most similar past tasks, filtered to those entries
        that actually provide summary text.
    """

    if similar is None:
        similar = retrieve_similar_tasks(text, summary_stats, embedder, top_n)
    return [str(stats.get("summary")) for _, stats, _ in similar if stats.get("summary")]
