from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .local import LocalEmbedder
from .vectorizer import cosine_similarity

EPISODIC_PATH = Path('.forgekeeper/memory/episodic.jsonl')

def load_episodic_memory(
    mem_path: Path = EPISODIC_PATH, db_path: Path | None = None
) -> Tuple[LocalEmbedder, Dict[str, Dict[str, object]]]:
    """Load episodic summaries, store their embeddings, and return stats."""
    mem_path = Path(mem_path)
    if db_path is None:
        db_path = mem_path.parent.parent / 'episodic_vectors.sqlite'

    summary: Dict[str, Dict[str, object]] = {}
    to_store: Dict[str, str] = {}
    if mem_path.is_file():
        for line in mem_path.read_text(encoding='utf-8').splitlines():
            try:
                data = json.loads(line)
            except Exception:
                continue
            key = str(data.get('task_id') or data.get('title') or '').strip()
            if not key:
                continue
            status = str(data.get('status', ''))
            sentiment = str(data.get('sentiment', '')).lower()
            summary_text = str(data.get('summary') or data.get('title') or '')
            stats = summary.setdefault(
                key,
                {
                    'success': 0,
                    'failure': 0,
                    'positive_sentiment': 0,
                    'negative_sentiment': 0,
                    'summary': summary_text,
                },
            )
            if 'success' in status or status == 'committed':
                stats['success'] = int(stats.get('success', 0)) + 1
            elif 'fail' in status or 'error' in status or status == 'no-file':
                stats['failure'] = int(stats.get('failure', 0)) + 1
            if sentiment == 'positive':
                stats['positive_sentiment'] = int(stats.get('positive_sentiment', 0)) + 1
            elif sentiment == 'negative':
                stats['negative_sentiment'] = int(stats.get('negative_sentiment', 0)) + 1
            if summary_text:
                stats['summary'] = summary_text
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
    """Return ``top_n`` episodic tasks most similar to ``text``."""
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
    """Return summaries of tasks semantically similar to ``text``."""
    if similar is None:
        similar = retrieve_similar_tasks(text, summary_stats, embedder, top_n)
    return [str(stats.get('summary')) for _, stats, _ in similar if stats.get('summary')]
