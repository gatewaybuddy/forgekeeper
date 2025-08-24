import time

from thoughts import RecursiveThinker
import thoughts.generator as tg
import thoughts.summary as ts
import thoughts.loop as tl


def test_recursive_thinker_start_stop(monkeypatch):
    monkeypatch.setattr(tg, "generate_internal_prompt", lambda state, goals: "prompt")
    monkeypatch.setattr(tg, "process_thought", lambda response: {"thought": response, "expose": False})
    monkeypatch.setattr(ts, "reflect_recent_thoughts", lambda: "reflection")
    monkeypatch.setattr(ts, "summarize_thoughts", lambda: {"summary": "", "emotion": "neutral"})
    monkeypatch.setattr(tl.llm_core, "ask", lambda prompt: "thought")
    monkeypatch.setattr(tl, "load_state", lambda: {})
    monkeypatch.setattr(tl, "get_active_goals", lambda: [])
    monkeypatch.setattr(tl, "expose", lambda thought: None)

    rt = RecursiveThinker(sleep_interval=0.001)
    rt.start()
    time.sleep(0.01)
    rt.stop()
    assert rt._thread is not None
    assert not rt._thread.is_alive()
