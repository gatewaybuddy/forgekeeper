from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from typing import List

from ..memory.agentic.orchestrator import MemoryOrchestrator
from ..memory.agentic.registry import all as all_agents, by_id
from ..memory.agentic.persistence import dump_agent_spec, render_system_prompt
from ..memory.events import event_from_text


def _run(mode: str, shadow: bool = False) -> None:
    text = sys.stdin.read()
    orchestrator = MemoryOrchestrator(all_agents(), mode=mode)
    event = event_from_text("agent_output", text)
    suggestions = orchestrator.handle(event)
    patched = text if shadow else orchestrator.apply_patches(text, suggestions)
    print(patched)
    print(json.dumps([asdict(s) for s in suggestions], indent=2))


def _list_agents() -> None:
    for agent in all_agents():
        print(f"{agent.id}\t{agent.confidence:.2f}")


def _dump_agent(agent_id: str) -> None:
    agent = by_id(agent_id)
    if not agent:
        print("Unknown agent", file=sys.stderr)
        sys.exit(1)
    yaml_text = dump_agent_spec(agent)
    print(yaml_text)
    spec = {
        "id": agent.id,
        "kind": agent.kind,
        "trigger": getattr(agent, "trigger", {}),
        "action": getattr(agent, "action", {}),
    }
    print(render_system_prompt(spec))


def main(argv: List[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="fk-memory")
    sub = parser.add_subparsers(dest="cmd")

    run_p = sub.add_parser("run")
    run_p.add_argument(
        "--mode", choices=["interactive", "deepthink"], default="interactive"
    )

    shadow_p = sub.add_parser("shadow")
    shadow_p.add_argument(
        "--mode", choices=["interactive", "deepthink"], default="interactive"
    )

    sub.add_parser("list")
    dump_p = sub.add_parser("dump")
    dump_p.add_argument("agent_id")

    args = parser.parse_args(argv)
    if args.cmd == "run":
        _run(args.mode, shadow=False)
    elif args.cmd == "shadow":
        _run(args.mode, shadow=True)
    elif args.cmd == "list":
        _list_agents()
    elif args.cmd == "dump":
        _dump_agent(args.agent_id)
    else:
        parser.print_help()


if __name__ == "__main__":  # pragma: no cover
    main()
