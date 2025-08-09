"""Utilities to modify source code files using a coding LLM."""

from __future__ import annotations

import re
from pathlib import Path
from typing import List

try:  # Optional import; tests may monkeypatch this
    from forgekeeper.app.services.llm_router import ask_coder
except Exception:  # pragma: no cover - dependency may be missing
    def ask_coder(prompt: str) -> str:  # type: ignore
        raise RuntimeError("LLM backend is unavailable")


def _load_repo_readme(start: Path) -> str:
    """Return the content of the nearest README.md above *start* if found."""

    for parent in [start] + list(start.parents):
        candidate = parent / "README.md"
        if candidate.exists():
            return candidate.read_text(encoding="utf-8")
    return ""


def generate_code_edit(
    task: str,
    file_path: str,
    file_summary: str,
    guidelines: str,
) -> str:
    """Return a unified diff patch that applies *task* to *file_path*.

    Parameters
    ----------
    task: str
        Description of the desired change.
    file_path: str
        Path to the target file.
    file_summary: str
        Precomputed summary of the file's purpose.
    guidelines: str
        Additional coding style or testing instructions.
    """

    p = Path(file_path)
    original_code = p.read_text(encoding="utf-8")
    readme_text = _load_repo_readme(p.resolve().parent)

    ext = p.suffix.lower()
    if ext == ".py":
        language = "python"
    elif ext in {".ts", ".tsx"}:
        language = "typescript"
    else:
        language = ""

    lang_block = f"{language}\n" if language else ""
    prompt = (
        "You are an autonomous code editor. Modify the provided file to satisfy the task. "
        "Respond **only** with a unified diff (git patch format) touching the given file.\n\n"
        f"Task:\n{task}\n\n"
        f"File path: {file_path}\n"
        f"File summary: {file_summary}\n\n"
        f"Repository README:\n{readme_text}\n\n"
        f"Guidelines:\n{guidelines}\n\n"
        "File contents:\n"
        f"```{lang_block}{original_code}\n```"
    )

    return ask_coder(prompt).strip()


def apply_unified_diff(patch: str) -> List[str]:
    """Apply a unified diff patch, returning a list of modified file paths.

    The function first attempts to use the optional ``python-patch`` module. If
    unavailable, a minimal inline patcher is used which handles single-file
    patches with standard unified diff hunks.
    """

    changed: List[str] = []
    try:  # pragma: no cover - optional dependency
        import patch as patch_lib  # type: ignore
    except Exception:  # pragma: no cover - dependency not available
        patch_lib = None

    if patch_lib is not None:  # pragma: no cover - exercised only when installed
        try:
            patch_set = patch_lib.fromstring(patch)
            patch_set.apply()
            for item in patch_set.items:
                if item.target:
                    changed.append(str(item.target))
            return changed
        except Exception:
            pass  # Fall back to inline application

    lines = patch.splitlines(True)
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if line.startswith('--- '):
            idx += 1
            if idx >= len(lines) or not lines[idx].startswith('+++ '):
                break
            new_path = lines[idx][4:].strip().split('\t')[0]
            if new_path.startswith('b/'):
                new_path = new_path[2:]
            file_path = Path(new_path)
            original_lines = file_path.read_text(encoding='utf-8').splitlines(True)
            idx += 1
            while idx < len(lines) and not lines[idx].startswith('@@'):
                idx += 1
            while idx < len(lines) and lines[idx].startswith('@@'):
                header = lines[idx]
                m = re.match(r'@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@', header)
                if not m:
                    break
                start_old = int(m.group(1))
                idx += 1
                hunk = []
                while idx < len(lines) and not lines[idx].startswith('@@') and not lines[idx].startswith('--- '):
                    hunk.append(lines[idx])
                    idx += 1
                original_lines = _apply_hunk(original_lines, start_old, hunk)
            file_path.write_text(''.join(original_lines), encoding='utf-8')
            changed.append(str(file_path))
        else:
            idx += 1
    return changed


def _apply_hunk(lines: List[str], start: int, hunk_lines: List[str]) -> List[str]:
    """Apply a diff hunk starting at ``start`` (1-based) to ``lines``."""

    idx = start - 1
    result = lines[:idx]
    src_idx = idx
    for hline in hunk_lines:
        if not hline:
            continue
        op = hline[0]
        text = hline[1:]
        if op == ' ':
            if lines[src_idx] != text:
                raise ValueError('Hunk does not match original content')
            result.append(lines[src_idx])
            src_idx += 1
        elif op == '-':
            if lines[src_idx] != text:
                raise ValueError('Hunk does not match original content')
            src_idx += 1
        elif op == '+':
            result.append(text)
        else:  # pragma: no cover - defensive programming
            raise ValueError(f'Unknown patch operation: {op!r}')
    result.extend(lines[src_idx:])
    return result

