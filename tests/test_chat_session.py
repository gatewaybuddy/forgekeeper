import importlib
import sys
from pathlib import Path

import pymongo

sys.path.append(str(Path(__file__).resolve().parents[1]))


class _DummyCollection:
    def create_index(self, *args, **kwargs):
        pass


class _DummyDB:
    def __getitem__(self, name):
        return _DummyCollection()


class _DummyClient:
    def __getitem__(self, name):
        return _DummyDB()


def test_generate_response(monkeypatch):
    monkeypatch.setattr(pymongo, "MongoClient", lambda *args, **kwargs: _DummyClient())

    chat_session = importlib.import_module("forgekeeper.app.chats.chat_session")

    monkeypatch.setattr(chat_session, "load_memory", lambda session_id: {"messages": []})
    monkeypatch.setattr(chat_session, "save_message", lambda *args, **kwargs: None)

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
