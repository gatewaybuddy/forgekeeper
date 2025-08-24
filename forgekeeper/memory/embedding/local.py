from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

from .vectorizer import SimpleTfidfVectorizer

DB_PATH = Path('.forgekeeper/vectors.sqlite')


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
