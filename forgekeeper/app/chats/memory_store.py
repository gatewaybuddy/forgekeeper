
"""Compatibility wrapper for legacy memory_store imports.

This module re-exports the memory utilities now provided by
``forgekeeper.app.chats.memory`` so older imports continue to work.
"""
from forgekeeper.app.chats.memory import (
    load_memory,
    get_memory,
    set_memory,
    save_message,
    reset_memory,
    summarize_thoughts,
    set_pending_confirmation,
    get_pending_confirmation,
    request_think_aloud,
    set_think_aloud,
    grant_think_aloud_consent,
    get_think_aloud,
    prune_memory,
    update_memory_entries,
    default_relevance_check,
)

__all__ = [
    "load_memory",
    "get_memory",
    "set_memory",
    "save_message",
    "reset_memory",
    "summarize_thoughts",
    "set_pending_confirmation",
    "get_pending_confirmation",
    "request_think_aloud",
    "set_think_aloud",
    "grant_think_aloud_consent",
    "get_think_aloud",
    "prune_memory",
    "update_memory_entries",
    "default_relevance_check",
]

