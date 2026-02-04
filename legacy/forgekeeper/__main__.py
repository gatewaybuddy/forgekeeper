"""Forgekeeper CLI entry point - argument parsing and command dispatch."""

from __future__ import annotations

import argparse
import sys

from forgekeeper.cli import (
    run_chat,
    run_compose,
    run_consciousness_repl,
    run_ensure_stack,
    run_switch_core,
    run_up_core,
    show_logs_help,
)


def main(argv: list[str] | None = None) -> int:
    """Main entry point for Forgekeeper CLI.

    Args:
        argv: Command line arguments (default: sys.argv)

    Returns:
        Exit code
    """
    p = argparse.ArgumentParser(description="Forgekeeper launcher (fresh start)")
    sub = p.add_subparsers(dest="cmd")

    # Import consciousness CLI (optional)
    try:
        from forgekeeper.consciousness_cli import setup_consciousness_parser, handle_consciousness_command
        setup_consciousness_parser(sub)
        has_consciousness = True
    except Exception:
        has_consciousness = False

    # Conversational REPL
    sub.add_parser(
        "talk",
        help="Start conversational interface with consciousness (REPL mode)",
        aliases=["repl"]
    )

    # Compose: full stack
    sub.add_parser("compose", help="Ensure full stack (build), hold FG; Ctrl+C tears down")

    # Up-core: inference only
    sub.add_parser("up-core", help="Start only Core (llama.cpp) via compose")

    # Chat command
    s_chat = sub.add_parser("chat", help="Send a prompt and stream reasoning/final")
    s_chat.add_argument("-p", "--prompt", required=False, default="", help="Prompt text (reads stdin if omitted)")
    s_chat.add_argument("--base-url", dest="base_url", default=None)
    s_chat.add_argument("--model", dest="model", default=None)
    s_chat.add_argument("--no-stream", dest="no_stream", action="store_true", help="Disable streaming")
    s_chat.add_argument("--tools", dest="tools", choices=["dir"], default=None, help="Enable simple tools demo")
    s_chat.add_argument("--workdir", dest="workdir", default=None, help="Restrict tools to this workspace root")
    s_chat.add_argument("--system", dest="system", default=None, help="Override system prompt")

    # Ensure-stack command
    s_ens = sub.add_parser("ensure-stack", help="Idempotently ensure full stack is up")
    s_ens.add_argument("--build", dest="build", action="store_true", help="Build images before starting")
    s_ens.add_argument("--include-mongo", dest="include_mongo", action="store_true", help="Also ensure MongoDB is up")
    s_ens.add_argument("--profile", dest="profiles", action="append", default=None, help="Compose profile to enable")
    s_ens.add_argument("--compose-file", dest="compose_file", default=None, help="Compose file path")

    # Switch-core command
    s_switch = sub.add_parser("switch-core", help="Switch inference core (llama|vllm)")
    s_switch.add_argument("kind", choices=["llama", "vllm"], help="Target core backend")
    s_switch.add_argument("--no-restart", dest="no_restart", action="store_true", help="Only update .env")

    # Logs command
    s_logs = sub.add_parser("logs", help="Show log locations and useful commands", aliases=["help-logs"])
    s_logs.add_argument(
        "--category",
        dest="category",
        choices=["conversation", "system", "memory", "docker", "all"],
        default="all",
        help="Show specific log category"
    )

    args = p.parse_args(argv)

    # Dispatch to command handlers
    if args.cmd in ("consciousness", "c"):
        if has_consciousness:
            return handle_consciousness_command(args)
        else:
            print("Consciousness CLI not available", file=sys.stderr)
            return 1

    if args.cmd in ("talk", "repl"):
        return run_consciousness_repl()

    if args.cmd in ("logs", "help-logs"):
        return show_logs_help(args.category)

    if args.cmd == "compose" or args.cmd is None:
        rc = run_compose()
        if rc != 0:
            # Fallback to core-only
            print("Compose start failed or was cancelled; bringing up Core only...", file=sys.stderr)
            rc2 = run_up_core()
            if rc2 == 0:
                print("Core started. Try: python -m forgekeeper chat -p 'Hello'", file=sys.stderr)
            return rc2
        return 0

    if args.cmd == "up-core":
        return run_up_core()

    if args.cmd == "chat":
        return run_chat(
            args.prompt,
            args.base_url,
            args.model,
            args.no_stream,
            tools=args.tools,
            workdir=args.workdir,
            system=args.system
        )

    if args.cmd == "ensure-stack":
        return run_ensure_stack(args.build, args.include_mongo, args.profiles, args.compose_file)

    if args.cmd == "switch-core":
        return run_switch_core(args.kind, no_restart=args.no_restart)

    p.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
