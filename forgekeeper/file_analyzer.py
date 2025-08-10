import json
from pathlib import Path


def rank_file_relevance(task_prompt: str, summary: str) -> float:
    """Returns relevance score of summary to task_prompt between 0.0 and 1.0."""
    task_lower = task_prompt.lower()
    summary_lower = summary.lower()
    if not task_prompt:
        return 0.0
    if task_lower in summary_lower:
        return 1.0
    words = {w for w in task_lower.split() if w}
    if not words:
        return 0.0
    matches = sum(1 for w in words if w in summary_lower)
    return matches / len(words)


def analyze_repo_for_task(task_prompt: str, summary_path: str = "forgekeeper/summaries.json") -> list[dict]:
    """Return list of files ranked by relevance to the task prompt."""
    path = Path(summary_path)
    if not path.is_file():
        return []
    summaries = json.loads(path.read_text(encoding="utf-8"))
    results = []
    for file, info in summaries.items():
        summary_text = info.get("summary", "")
        lang = info.get("lang", "")
        score = rank_file_relevance(task_prompt, summary_text)
        results.append({"file": file, "lang": lang, "score": score, "summary": summary_text})
    results.sort(key=lambda x: x["score"], reverse=True)
    return results
