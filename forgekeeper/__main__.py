from __future__ import annotations

"""Command-line entry point for Forgekeeper.

Defaults to starting the local stack so users can simply run
"forgekeeper" on Windows or Linux.
"""

import argparse
from typing import Callable, Optional


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Forgekeeper entry point")
    sub = parser.add_subparsers(dest="command")

    p_run = sub.add_parser("pipeline", help="Run full Forgekeeper pipeline")
    p_run.set_defaults(func=run_pipeline)

    p_console = sub.add_parser("console", help="Start interactive console")
    p_console.set_defaults(func=run_console)

    p_pconsole = sub.add_parser(
        "pconsole", help="Start persistent console via GraphQL API"
    )
    p_pconsole.set_defaults(func=run_pconsole)

    return parser


def main(argv: Optional[list[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    func: Callable[..., None]
    if not hasattr(args, "func"):
        # Default to start for simple `forgekeeper` usage
        return run_start()
    func = getattr(args, "func")
    # Pass args if function expects them
    try:
        func(args)
    except TypeError:
        func()


def run_pipeline() -> None:
    from .main import main as pipeline_main

    pipeline_main()


def run_start(args=None) -> None:
    from .app.starter import start_stack

    cli_only = bool(getattr(args, "cli_only", False)) if args else False
    tiny = bool(getattr(args, "tiny", False)) if args else False
    watch = bool(getattr(args, "watch_restart", True)) if args else True
    p_start = sub.add_parser("start", help="Start local stack (default)")
    p_start.add_argument("--cli-only", action="store_true", help="Start Python agent only")
    p_start.add_argument("--tiny", action="store_true", help="Use tiny CPU-only Transformers preset")
    p_start.add_argument("--watch-restart", action="store_true", help="Watch restart flag and restart services when requested")
    p_start.set_defaults(func=run_start)
    start_stack(cli_only=cli_only, tiny=tiny, watch_restart=watch)


def run_console() -> None:
    from run_console.__main__ import main as console_main

    console_main()


def run_pconsole() -> None:
    from persistent_console.__main__ import main as persistent_main

    persistent_main()


if __name__ == "__main__":
    main()
