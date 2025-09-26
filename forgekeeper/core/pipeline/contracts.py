"""Shared type contracts and helpers for the pipeline layer."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, MutableMapping, Protocol, runtime_checkable


@dataclass(slots=True)
class ExecutionResult:
    """Structured view over the payload returned by an executor."""

    status: str
    data: dict[str, Any]

    def __post_init__(self) -> None:
        # Copy to avoid leaking references and ensure a status key is always present.
        self.data = dict(self.data)
        self.data.setdefault("status", self.status)
        self.status = str(self.data.get("status", "needs_review")).strip() or "needs_review"

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "ExecutionResult":
        """Create an :class:`ExecutionResult` from a mapping."""

        status = str(payload.get("status", "needs_review")).strip() or "needs_review"
        return cls(status=status, data=dict(payload))

    def to_dict(self) -> dict[str, Any]:
        """Return a dictionary representation suitable for the current pipeline."""

        return dict(self.data)

    @property
    def edits(self) -> list[dict[str, Any]] | None:
        """Return the edit payloads if present."""

        edits = self.data.get("edits")
        if isinstance(edits, list):
            return [dict(edit) for edit in edits if isinstance(edit, Mapping)]
        return None

    @property
    def commit_requested(self) -> bool:
        """Whether the executor requested a commit."""

        return bool(self.data.get("commit"))

    @property
    def commit_options(self) -> dict[str, Any]:
        """Return commit related options from the payload."""

        keys = {
            "commit_message",
            "create_branch",
            "branch_prefix",
            "commands",
            "autonomous",
            "task_id",
            "auto_push",
            "rationale",
            "run_checks",
        }
        return {key: self.data[key] for key in keys if key in self.data}


@dataclass(slots=True)
class StageOutcome:
    """Wrapper for staged file data produced by the pipeline."""

    path: str
    result: dict[str, Any]

    def __post_init__(self) -> None:
        self.result = dict(self.result)
        self.path = str(self.path)

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "StageOutcome":
        """Create a :class:`StageOutcome` from a mapping."""

        path = str(payload.get("path", ""))
        result_obj = payload.get("result")
        result: MutableMapping[str, Any]
        if isinstance(result_obj, Mapping):
            result = dict(result_obj)
        else:
            result = {}
        return cls(path=path, result=dict(result))

    def to_dict(self) -> dict[str, Any]:
        """Return a dictionary representation compatible with the existing pipeline."""

        return {"path": self.path, "result": dict(self.result)}

    @property
    def outcome(self) -> str:
        return str(self.result.get("outcome", ""))

    @property
    def files(self) -> list[str]:
        files = self.result.get("files")
        if isinstance(files, list):
            return [str(file) for file in files]
        return []

    @property
    def error(self) -> str | None:
        value = self.result.get("error")
        return str(value) if isinstance(value, str) else None

    @property
    def sandbox(self) -> Mapping[str, Any] | None:
        sandbox = self.result.get("sandbox")
        if isinstance(sandbox, Mapping):
            return sandbox
        return None


@runtime_checkable
class PlannerSelector(Protocol):
    """Callable responsible for providing planner metadata for a task."""

    def __call__(
        self,
        task: Mapping[str, Any],
        *,
        guidelines: str = "",
        repo_root: Path | str | None = None,
    ) -> Mapping[str, Any]:
        ...


@runtime_checkable
class ExecutorInvoker(Protocol):
    """Callable responsible for executing a task."""

    def __call__(self, task: Mapping[str, Any], guidelines: str) -> Mapping[str, Any]:
        ...


@runtime_checkable
class StagingPolicy(Protocol):
    """Callable responsible for staging file edits."""

    def __call__(
        self,
        original_code: str,
        modified_code: str,
        file_path: Path | str,
        *,
        auto_stage: bool = True,
        dry_run: bool = False,
        task_id: str = "manual",
        run_sandbox: bool = True,
        extra_files: Iterable[str] | None = None,
    ) -> Mapping[str, Any]:
        ...


@runtime_checkable
class CommitPolicy(Protocol):
    """Callable responsible for committing and optionally pushing changes."""

    def __call__(
        self,
        message: str,
        *,
        create_branch: bool = False,
        branch_prefix: str | None = None,
        run_checks: bool = True,
        commands: Iterable[str] | None = None,
        autonomous: bool = True,
        task_id: str = "manual",
        auto_push: bool | None = None,
        rationale: str | None = None,
    ) -> Mapping[str, Any]:
        ...


__all__ = [
    "CommitPolicy",
    "ExecutorInvoker",
    "ExecutionResult",
    "PlannerSelector",
    "StageOutcome",
    "StagingPolicy",
]
