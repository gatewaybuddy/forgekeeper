"""Executor helpers for the unified task pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List

import yaml


@dataclass
class ParsedInstructions:
    status: str = "needs_review"
    edits: List[Dict[str, Any]] | None = None
    commit: Dict[str, Any] | None = None
    extra: Dict[str, Any] | None = None


def _parse_structured_text(text: str) -> Dict[str, Any]:
    text = text.strip()
    if not text:
        return {}
    for loader in (json.loads, yaml.safe_load):
        try:
            data = loader(text)
        except Exception:
            continue
        if isinstance(data, dict):
            return data
    return {}


def _merge_payloads(sources: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {}
    for payload in sources:
        if not isinstance(payload, dict):
            continue
        for key, value in payload.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key].update(value)  # type: ignore[call-arg]
            else:
                merged[key] = value
    return merged


def _load_instructions(task: Dict[str, Any], guidelines: str) -> ParsedInstructions:
    candidates: List[Dict[str, Any]] = []
    for key in ("executor_payload", "executor", "instructions"):
        payload = task.get(key)
        if isinstance(payload, dict):
            candidates.append(payload)
    if guidelines and any(ch in guidelines for ch in "{[\n"):  # naive hint for structured data
        structured = _parse_structured_text(guidelines)
        if structured:
            candidates.append(structured)
    merged = _merge_payloads(candidates)
    status = str(merged.get("status", "needs_review")).strip() or "needs_review"
    commit = merged.get("commit") if isinstance(merged.get("commit"), dict) else None
    edits = merged.get("edits") if isinstance(merged.get("edits"), list) else None
    extra = {k: v for k, v in merged.items() if k not in {"status", "commit", "edits"}}
    return ParsedInstructions(status=status, edits=edits, commit=commit, extra=extra or None)


def _resolve_original(path: Path, spec: Dict[str, Any]) -> str:
    if "original" in spec and spec["original"] is not None:
        return str(spec["original"])
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def _apply_edit_spec(original: str, spec: Dict[str, Any]) -> str:
    if "modified" in spec and spec["modified"] is not None:
        return str(spec["modified"])
    if "content" in spec and spec["content"] is not None:
        return str(spec["content"])
    content = original
    if "append" in spec and spec["append"] is not None:
        content = (content or "") + str(spec["append"])
    replace_spec = spec.get("replace")
    if isinstance(replace_spec, dict):
        old = str(replace_spec.get("old", ""))
        new = str(replace_spec.get("new", ""))
        content = (content or "").replace(old, new)
    return content


def build_default_executor():
    """Return a callable that converts structured instructions into pipeline edits."""

    def _executor(task: Dict[str, Any], guidelines: str) -> Dict[str, Any]:
        instructions = _load_instructions(task, guidelines)
        response: Dict[str, Any] = {"status": instructions.status}
        run_sandbox_default = True
        dry_run_default = False
        if instructions.extra:
            run_sandbox_default = bool(instructions.extra.get("run_sandbox", True))
            dry_run_default = bool(instructions.extra.get("dry_run", False))
            response.update({k: v for k, v in instructions.extra.items() if k in {"notes", "metadata"}})

        edits_payload: List[Dict[str, Any]] = []
        if instructions.edits:
            for entry in instructions.edits:
                if not isinstance(entry, dict) or "path" not in entry:
                    continue
                spec = entry.copy()
                path = Path(spec.pop("path"))
                original = _resolve_original(path, spec)
                modified = _apply_edit_spec(original, spec)
                edits_payload.append(
                    {
                        "path": str(path),
                        "original": original,
                        "modified": modified,
                        "run_sandbox": spec.get("run_sandbox", run_sandbox_default),
                        "dry_run": spec.get("dry_run", dry_run_default),
                        "extra_files": spec.get("extra_files"),
                    }
                )
        if edits_payload:
            response["edits"] = edits_payload

        if instructions.commit:
            commit_cfg = instructions.commit
            response.update(
                {
                    "commit": True,
                    "commit_message": commit_cfg.get("message"),
                    "create_branch": commit_cfg.get("create_branch"),
                    "branch_prefix": commit_cfg.get("branch_prefix"),
                    "commands": commit_cfg.get("commands"),
                    "autonomous": commit_cfg.get("autonomous"),
                    "task_id": commit_cfg.get("task_id"),
                    "auto_push": commit_cfg.get("auto_push"),
                    "rationale": commit_cfg.get("rationale"),
                    "run_checks": commit_cfg.get("run_checks"),
                }
            )
        return response

    return _executor


__all__ = ["build_default_executor"]
