import json
from pathlib import Path

from forgekeeper.memory.embedding import LocalEmbedder

from .python import summarize_python_file
from .typescript import summarize_typescript_file

EXCLUDE_DIRS = {'.git', 'venv', '__pycache__'}


def is_ignored(path: Path) -> bool:
    """Return True if the path should be ignored when scanning."""
    for part in path.parts:
        if part in EXCLUDE_DIRS or part.startswith('.'):
            return True
    return False


def summarize_file(file_path: Path) -> dict:
    """Return a summary for a supported file type."""
    ext = file_path.suffix.lower()
    if ext == ".py":
        return summarize_python_file(file_path)
    if ext in {".ts", ".tsx"}:
        return summarize_typescript_file(file_path, ext.lstrip("."))
    text = file_path.read_text(encoding="utf-8", errors="ignore")
    return {"summary": "Unsupported file type", "lines": len(text.splitlines())}


def summarize_repository(root: str = ".") -> dict:
    """Walk the repository and summarize Python and TypeScript files."""
    root_path = Path(root).resolve()
    results: dict[str, dict] = {}
    for path in root_path.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".py", ".ts", ".tsx"}:
            if is_ignored(path):
                continue
            rel = path.relative_to(root_path)
            results[str(rel)] = summarize_file(path)

    if results:
        embedder = LocalEmbedder()
        embedder.store_embeddings({f: info["summary"] for f, info in results.items()})

    return results


def main() -> None:
    summaries = summarize_repository()
    out_path = Path('forgekeeper/summaries.json')
    out_path.write_text(json.dumps(summaries, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
