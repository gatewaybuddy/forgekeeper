import re
from pathlib import Path

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


def summarize_typescript_file(file_path: Path, lang: str) -> dict:
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
