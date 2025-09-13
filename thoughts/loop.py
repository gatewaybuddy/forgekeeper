from __future__ import annotations

import threading
import time
import os
from typing import Dict, List

if os.getenv("FK_LLM_IMPL", "vllm").lower() == "triton":
    from forgekeeper.llm.llm_service_triton import llm_core
else:
    from forgekeeper.llm.llm_service_vllm import llm_core
from forgekeeper.state_manager import load_state
from goal_manager.storage import get_active_goals
from forgekeeper.user_interface import expose

from . import generator, summary

DEFAULT_SLEEP = 10
REFLECTION_INTERVAL = 5
SUMMARY_INTERVAL = 10
MAX_DEPTH = 50


class RecursiveThinker:
    """Background thread that generates and reflects on thoughts."""

    def __init__(self, sleep_interval: int = DEFAULT_SLEEP) -> None:
        self.sleep_interval = sleep_interval
        self._running = False
        self._thread: threading.Thread | None = None
        self._iteration = 0

    def _loop(self) -> None:
        while self._running:
            state = load_state()
            goals = get_active_goals()
            prompt = generator.generate_internal_prompt(state, goals)
            try:
                response = llm_core.ask(prompt)
            except Exception as exc:  # pragma: no cover - defensive
                response = f"Thought generation error: {exc}"
            result = generator.process_thought(response)
            if result["expose"]:
                expose(result["thought"])
            self._iteration += 1
            if self._iteration % REFLECTION_INTERVAL == 0:
                reflection = summary.reflect_recent_thoughts()
                generator.process_thought(reflection)
            if (
                self._iteration % SUMMARY_INTERVAL == 0
                or len(generator._thought_history) >= MAX_DEPTH
                or generator._redundant_count >= 3
            ):
                summary.summarize_thoughts()
            time.sleep(self.sleep_interval)

    def start(self) -> None:
        """Start the background recursive thinking loop."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop the background thinking loop."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self.sleep_interval)
