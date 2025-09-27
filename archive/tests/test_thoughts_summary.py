import json

import thoughts.generator as tg
import thoughts.summary as ts
from thoughts import summarize_thoughts, get_last_summary


def test_summarize_thoughts_with_emotion(monkeypatch):
    tg._thought_history.clear()
    tg._thought_history.extend(["I am happy", "This is great"])

    def fake_ask(prompt):
        return json.dumps({"summary": "Feeling good", "emotion": "positive"})

    monkeypatch.setattr(ts.llm_core, "ask", fake_ask)
    result = summarize_thoughts()
    assert result == {"summary": "Feeling good", "emotion": "positive"}
    assert get_last_summary() == result
    assert tg._thought_history == ["Feeling good"]
