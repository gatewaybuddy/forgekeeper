"""Compatibility shim for commit operations."""

from __future__ import annotations

from forgekeeper.core.git.commit_ops import commit_changes, push_branch

__all__ = ["commit_changes", "push_branch"]
