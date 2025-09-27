import importlib


def test_generate_response(monkeypatch):
    chat_session = importlib.import_module("forgekeeper.app.chats.chat_session")

    # Patch GraphQL helpers
    monkeypatch.setattr(chat_session, "list_conversations", lambda project_id: [])
    monkeypatch.setattr(chat_session, "send_message", lambda *args, **kwargs: True)
    monkeypatch.setattr(chat_session, "append_message", lambda *args, **kwargs: True)

    captured = {}

    def fake_ask_llm(prompt):
        captured["prompt"] = prompt
        return "response"

    monkeypatch.setattr(chat_session, "ask_llm", fake_ask_llm)

    session = chat_session.ChatSession("session1")
    session.user_prompt("hello")
    resp = session.generate_response()

    assert resp == "response"
    assert session.history[-1] == {"role": "assistant", "content": "response"}
    assert "user: hello" in captured["prompt"]
    assert isinstance(captured["prompt"], str)
