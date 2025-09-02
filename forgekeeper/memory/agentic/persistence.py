from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import yaml

from .base import MemoryAgent


def load_agent_specs(directory: Path) -> List[Dict[str, Any]]:
    specs: List[Dict[str, Any]] = []
    for pattern in ("*.yml", "*.yaml"):
        for path in directory.glob(pattern):
            try:
                specs.append(yaml.safe_load(path.read_text(encoding="utf-8")))
            except Exception:
                continue
    return specs


def dump_agent_spec(agent: MemoryAgent, path: Path | None = None) -> str:
    spec = {
        "id": getattr(agent, "id", ""),
        "kind": getattr(agent, "kind", ""),
        "trigger": getattr(agent, "trigger", {}),
        "read_scope": getattr(agent, "read_scope", ""),
        "action": getattr(agent, "action", {}),
        "cost_cap": getattr(agent, "cost_cap", 0.0),
        "confidence": getattr(agent, "confidence", 0.0),
        "exemplars": getattr(agent, "exemplars", {"positive": [], "negative": []}),
        "system_prompt": agent.system_prompt(),
    }
    yaml_text = yaml.safe_dump(spec, sort_keys=False)
    if path is not None:
        Path(path).write_text(yaml_text, encoding="utf-8")
    return yaml_text


def render_system_prompt(spec: Dict[str, Any]) -> str:
    trigger = spec.get("trigger", {})
    action = spec.get("action", {})
    lines = [
        f"Memory agent {spec.get('id', 'unknown')} ({spec.get('kind', '')})",
        f"Trigger: {trigger}",
        f"Action: {action}",
    ]
    return "\n".join(lines)
