import ast
import json
import re
from pathlib import Path

from forgekeeper.memory.embedding import LocalEmbedder

EXCLUDE_DIRS = {'.git', 'venv', '__pycache__'}


def is_ignored(path: Path) -> bool:
    """Return True if the path should be ignored when scanning."""
    for part in path.parts:
        if part in EXCLUDE_DIRS or part.startswith('.'):
            return True
    return False


def summarize_py_file(file_path: Path) -> dict:
    """Return a summary for a Python file."""
    text = file_path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    truncated_text = "\n".join(lines[:500])
    try:
        tree = ast.parse(truncated_text)
        doc = ast.get_docstring(tree)
        funcs = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
        classes = [n.name for n in tree.body if isinstance(n, ast.ClassDef)]
    except SyntaxError:
        doc = None
        funcs = []
        classes = []

    parts: list[str] = []
    if doc:
        parts.append(doc.splitlines()[0])
    if classes:
        parts.append("Classes: " + ", ".join(classes))
    if funcs:
        parts.append("Functions: " + ", ".join(funcs))

    summary_text = " | ".join(parts) if parts else "No summary available"
    return {"summary": summary_text, "lines": len(lines), "lang": "py"}


IMPORT_RE = re.compile(r'^import\s+(?:[\w*\s{},]*from\s+)?[\'"]([^\'"]+)[\'"]', re.MULTILINE)
EXPORT_RE = re.compile(r'^export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)', re.MULTILINE)
EXPORT_BRACE_RE = re.compile(r'^export\s*{\s*([^}]+)\s*}', re.MULTILINE)
FUNCTION_RE = re.compile(r'function\s+(\w+)\s*\(')
ARROW_FUNC_RE = re.compile(r'const\s+(\w+)\s*=\s*(?:async\s*)?(?:[^=]*?)=>')


def _extract_top_comment(lines: list[str]) -> str | None:
    """Return the first comment or JSDoc block at the top of the file."""
    top: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("//"):
            top.append(line.lstrip("/ ").strip())
            i += 1
            continue
        if line.startswith("/*"):
            content = line.lstrip("/*").strip()
            if content.endswith("*/"):
                top.append(content.rstrip("*/").strip())
                break
            top.append(content.rstrip("*").strip())
            i += 1
            while i < len(lines):
                inner = lines[i].strip()
                if inner.endswith("*/"):
                    top.append(inner.rstrip("*/").lstrip("*").strip())
                    break
                top.append(inner.lstrip("*").strip())
                i += 1
            break
        break
    return top[0] if top else None


def summarize_ts_file(file_path: Path, lang: str) -> dict:
    """Return a summary for a TypeScript or TSX file."""
    text = file_path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    truncated_text = "\n".join(lines[:500])

    imports = IMPORT_RE.findall(truncated_text)
    exports = list(EXPORT_RE.findall(truncated_text))
    brace_exports = EXPORT_BRACE_RE.findall(truncated_text)
    for group in brace_exports:
        names = [n.strip().split(" as ")[-1] for n in group.split(",") if n.strip()]
        exports.extend(names)

    funcs = set(FUNCTION_RE.findall(truncated_text))
    funcs.update(ARROW_FUNC_RE.findall(truncated_text))

    parts: list[str] = []
    top_comment = _extract_top_comment(lines)
    if top_comment:
        parts.append(top_comment)
    if imports:
        parts.append("Imports: " + ", ".join(sorted(set(imports))))
    if exports:
        parts.append("Exports: " + ", ".join(sorted(set(exports))))
    if funcs:
        parts.append("Functions: " + ", ".join(sorted(funcs)))

    summary_text = " | ".join(parts) if parts else "No summary available"
    return {"summary": summary_text, "lines": len(lines), "lang": lang}


def summarize_file(file_path: Path) -> dict:
    """Return a summary for a supported file type."""
    ext = file_path.suffix.lower()
    if ext == ".py":
        return summarize_py_file(file_path)
    if ext in {".ts", ".tsx"}:
        return summarize_ts_file(file_path, ext.lstrip("."))
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

    # Store embeddings for summaries (used by ranking step)
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
