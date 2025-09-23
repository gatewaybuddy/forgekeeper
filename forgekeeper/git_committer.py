"""Compatibility wrapper exposing the core git committer."""

from __future__ import annotations

from forgekeeper.core.git.committer import commit_and_push_changes

__all__ = ["commit_and_push_changes"]
