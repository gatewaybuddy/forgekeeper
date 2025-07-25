import ast
import json
from pathlib import Path

EXCLUDE_DIRS = {'.git', 'venv', '__pycache__'}


def is_ignored(path: Path) -> bool:
    """Return True if the path should be ignored when scanning."""
    for part in path.parts:
        if part in EXCLUDE_DIRS or part.startswith('.'):
            return True
    return False


def summarize_file(file_path: Path) -> dict:
    """Return a summary and line count for a Python file."""
    text = file_path.read_text(encoding='utf-8', errors='ignore')
    lines = text.splitlines()
    truncated_text = '\n'.join(lines[:500])
    try:
        tree = ast.parse(truncated_text)
        doc = ast.get_docstring(tree)
        funcs = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
        classes = [n.name for n in tree.body if isinstance(n, ast.ClassDef)]
    except SyntaxError:
        doc = None
        funcs = []
        classes = []

    parts = []
    if doc:
        parts.append(doc.splitlines()[0])
    if classes:
        parts.append('Classes: ' + ', '.join(classes))
    if funcs:
        parts.append('Functions: ' + ', '.join(funcs))

    summary_text = ' | '.join(parts) if parts else 'No summary available'
    return {'summary': summary_text, 'lines': len(lines)}


def summarize_repository(root: str = '.') -> dict:
    """Walk the repository and summarize all Python files."""
    root_path = Path(root).resolve()
    results = {}
    for path in root_path.rglob('*.py'):
        if is_ignored(path):
            continue
        rel = path.relative_to(root_path)
        results[str(rel)] = summarize_file(path)
    return results


def main() -> None:
    summaries = summarize_repository()
    out_path = Path('forgekeeper/summaries.json')
    out_path.write_text(json.dumps(summaries, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
