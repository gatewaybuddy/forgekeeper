import ast
from pathlib import Path


def summarize_python_file(file_path: Path) -> dict:
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
