"""Enforce unified diff patch caps before applying changes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import subprocess
from pathlib import Path
import tarfile


@dataclass(slots=True)
class ApplyResult:
    applied: bool
    message: str
    changed_files: int
    changed_lines: int
    rollback_path: str | None = None


@dataclass(slots=True)
class _DiffStats:
    files: set[str]
    lines: int


def _collect_diff_stats(diff: str) -> _DiffStats:
    files: set[str] = set()
    lines = 0
    current: str | None = None
    for raw in diff.splitlines():
        if raw.startswith("diff --git "):
            current = None
            continue
        if raw.startswith("--- "):
            path = raw[4:].strip()
            if path != "/dev/null":
                if path.startswith("a/"):
                    path = path[2:]
                files.add(path)
            continue
        if raw.startswith("+++ "):
            path = raw[4:].strip()
            if path != "/dev/null":
                if path.startswith("b/"):
                    path = path[2:]
                files.add(path)
                current = path
            else:
                current = None
            continue
        if raw.startswith("+") and not raw.startswith("+++"):
            lines += 1
        elif raw.startswith("-") and not raw.startswith("---"):
            lines += 1
    return _DiffStats(files=files, lines=lines)


def apply_unified_diff(
    diff: str,
    repo_root: str | Path,
    *,
    max_files: int = 3,
    max_lines: int = 250,
    dry_run: bool = False,
) -> ApplyResult:
    repo_path = Path(repo_root)
    stats = _collect_diff_stats(diff)
    if not stats.files:
        return ApplyResult(False, "No files detected in diff.", 0, stats.lines)
    if len(stats.files) > max_files:
        return ApplyResult(
            False,
            f"Diff touches {len(stats.files)} files which exceeds cap of {max_files}.",
            len(stats.files),
            stats.lines,
        )
    if stats.lines > max_lines:
        return ApplyResult(
            False,
            f"Diff changes {stats.lines} lines which exceeds cap of {max_lines}.",
            len(stats.files),
            stats.lines,
        )

    rollback_path: Path | None = None
    if not dry_run:
        rollback_dir = repo_path / ".forgekeeper" / "rollback"
        rollback_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H-%M-%S")
        rollback_path = rollback_dir / f"{timestamp}.tar"
        with tarfile.open(rollback_path, "w") as tar:
            for relative in sorted(stats.files):
                candidate = repo_path / relative
                if candidate.exists():
                    tar.add(candidate, arcname=relative)
        proc = subprocess.run(
            ["git", "apply", "--allow-empty", "--whitespace=nowarn", "-"],
            input=diff.encode("utf-8"),
            cwd=repo_path,
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            if rollback_path.exists():
                rollback_path.unlink()
            message = proc.stderr.decode("utf-8", errors="ignore").strip() or "git apply failed"
            return ApplyResult(False, message, len(stats.files), stats.lines)
        message = "Patch applied."
    else:
        message = "Dry run successful."

    return ApplyResult(
        True,
        message,
        len(stats.files),
        stats.lines,
        str(rollback_path) if rollback_path else None,
    )


__all__ = ["ApplyResult", "apply_unified_diff"]

