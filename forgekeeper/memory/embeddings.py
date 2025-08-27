from pathlib import Path
from typing import List, Optional

from .embedding import (
    LocalEmbedder,
    load_episodic_memory,
    retrieve_similar_tasks,
    similar_task_summaries,
)


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
]
