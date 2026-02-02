"""Forgekeeper CLI package - command-line interface implementation."""

from .commands import (
    run_chat,
    run_consciousness_repl,
    run_switch_core,
    show_logs_help,
)
from .environment import (
    get_core_api_base,
    get_core_kind,
    get_repo_root,
    load_dotenv,
)
from .stack import (
    compose_down,
    run_compose,
    run_ensure_stack,
    run_up_core,
)

__all__ = [
    # Commands
    "run_chat",
    "run_consciousness_repl",
    "run_switch_core",
    "show_logs_help",
    # Environment
    "get_core_api_base",
    "get_core_kind",
    "get_repo_root",
    "load_dotenv",
    # Stack
    "compose_down",
    "run_compose",
    "run_ensure_stack",
    "run_up_core",
]
