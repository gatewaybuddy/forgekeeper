from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path
from typing import Dict, List, Optional

from .base import MemoryAgent

_REGISTRY: Dict[str, MemoryAgent] = {}


def register(agent: MemoryAgent) -> None:
    _REGISTRY[agent.id] = agent


def all() -> List[MemoryAgent]:
    return list(_REGISTRY.values())


def by_id(agent_id: str) -> Optional[MemoryAgent]:
    return _REGISTRY.get(agent_id)


# Auto-register built-in agents
_BUILTIN_DIR = Path(__file__).with_name("builtin")
if _BUILTIN_DIR.exists():
    for mod in pkgutil.iter_modules([str(_BUILTIN_DIR)]):
        importlib.import_module(f"{__name__.rsplit('.',1)[0]}.builtin.{mod.name}")
