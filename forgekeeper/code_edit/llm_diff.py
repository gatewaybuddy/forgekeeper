"""LLM-powered code diff generation."""

from pathlib import Path

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
