from __future__ import annotations

"""Deprecated CLI shim.

This module delegates to :mod:`forgekeeper.cli_main` to avoid duplicated
implementations. Imports of ``forgekeeper.cli`` remain supported by
re-exporting the public functions.
"""

from .cli_main import (  # noqa: F401
    interactive_console,
    persistent_console,
    main as _cli_main,
)


def main(argv: list[str] | None = None) -> None:  # pragma: no cover - thin wrapper
    _cli_main(argv)


__all__ = ["interactive_console", "persistent_console", "main"]
