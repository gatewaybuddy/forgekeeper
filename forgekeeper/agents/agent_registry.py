"""Registry for known ForgeKeeper agents.

Provides simple registration and lookup so that
components can retrieve agent metadata without
hard coding paths throughout the code base.
"""
from typing import Dict, Optional

AGENT_REGISTRY: Dict[str, Dict[str, object]] = {
    "core": {
        "name": "Core",
        "role": "Reflective Reasoning Agent",
        "model_path": "path/to/mistral.gguf",
        "active": True,
    },
    "coder": {
        "name": "Coder",
        "role": "Coding Agent",
        "model_path": "path/to/codellama.gguf",
        "active": True,
    },
}


def register_agent(key: str, name: str, role: str, model_path: str, active: bool = True) -> None:
    """Register a new agent or update an existing one."""
    AGENT_REGISTRY[key] = {
        "name": name,
        "role": role,
        "model_path": model_path,
        "active": active,
    }


def get_agent(key: str) -> Optional[Dict[str, object]]:
    """Retrieve agent metadata by key."""
    return AGENT_REGISTRY.get(key)


def list_agents(active_only: bool = False) -> Dict[str, Dict[str, object]]:
    """Return all registered agents, optionally filtering by active status."""
    if not active_only:
        return dict(AGENT_REGISTRY)
    return {k: v for k, v in AGENT_REGISTRY.items() if v.get("active")}
