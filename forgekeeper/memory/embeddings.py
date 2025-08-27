from pathlib import Path
from typing import List, Optional


from .embedding import (
    LocalEmbedder,
    load_episodic_memory,
    retrieve_similar_tasks,
    similar_task_summaries,
)

# Default location of episodic memory file used for embedding storage.
DEFAULT_MEM_PATH = Path(".forgekeeper/memory/episodic.jsonl")


def store_task_embedding(
    task_id: str,
    summary: str,
    mem_path: Optional[Path | str] = None,
) -> None:
    """Store an embedding for a single episodic memory entry.

    Parameters
    ----------
    task_id:
        Identifier used as the lookup key for the embedding.
    summary:
        Text summary associated with the task.
    mem_path:
        Optional path to the episodic memory file. The companion SQLite
        database holding the embeddings lives alongside this file. When omitted
        the default ``.forgekeeper/memory/episodic.jsonl`` path is used.
    """

    base = Path(mem_path) if mem_path is not None else DEFAULT_MEM_PATH
    db_path = base.parent.parent / "episodic_vectors.sqlite"
    embedder = LocalEmbedder(db_path=db_path)
    embedder.store_embeddings({task_id: summary})


def query_similar_tasks(
    text: str,
    top_n: int = 3,
    mem_path: Optional[Path | str] = None,
) -> List[str]:
    """Return summaries of past tasks similar to ``text``.

    Parameters
    ----------
    text:
        Description of the new task to compare against episodic memory.
    top_n:
        Maximum number of related task summaries to return.
    mem_path:
        Optional path to the episodic memory file. When omitted the default
        ``.forgekeeper/memory/episodic.jsonl`` location is used.
    """

    try:
        if mem_path is not None:
            embedder, summary = load_episodic_memory(Path(mem_path))
        else:
            embedder, summary = load_episodic_memory()
        return similar_task_summaries(text, summary, embedder, top_n)
    except Exception:
        return []


__all__ = [
    "LocalEmbedder",
    "load_episodic_memory",
    "retrieve_similar_tasks",
    "similar_task_summaries",
    "query_similar_tasks",
    "store_task_embedding",
]
