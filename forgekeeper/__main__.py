from __future__ import annotations

"""Command-line entry point for Forgekeeper."""

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
    func: Callable[[], None] = getattr(args, "func", run_pipeline)
    func()


def run_pipeline() -> None:
    from .main import main as pipeline_main

    pipeline_main()


def run_console() -> None:
    from run_console.__main__ import main as console_main

    console_main()


def run_pconsole() -> None:
    from persistent_console.__main__ import main as persistent_main

    persistent_main()


if __name__ == "__main__":
    main()
