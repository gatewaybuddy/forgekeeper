from __future__ import annotations


def main() -> None:  # pragma: no cover - CLI entry point
    # Dispatch to the CLI with subcommands (run/console/persistent-console)
    from .cli_main import main as _cli_main

    _cli_main()


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
