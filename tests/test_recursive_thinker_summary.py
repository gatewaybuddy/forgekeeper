import json

from forgekeeper import recursive_thinker as rt


def test_summarize_thoughts_with_emotion(monkeypatch):
    rt._thought_history.clear()
    rt._thought_history.extend(["I am happy", "This is great"])

    def fake_ask(prompt):
        return json.dumps({"summary": "Feeling good", "emotion": "positive"})

    monkeypatch.setattr(rt.llm_core, "ask", fake_ask)
    result = rt.summarize_thoughts()
    assert result == {"summary": "Feeling good", "emotion": "positive"}
    assert rt.get_last_summary() == result
    assert rt._thought_history == ["Feeling good"]
