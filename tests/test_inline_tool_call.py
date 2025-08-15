from flask import Flask
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from forgekeeper.app.routes import chat_routes
from forgekeeper.functions.say_hello import say_hello


def test_inline_tool_call(monkeypatch):
    monkeypatch.setattr(chat_routes, "ask_llm", lambda prompt: "call: say_hello(name='Alice')")
    monkeypatch.setattr(chat_routes, "functions", {"say_hello": say_hello})

    app = Flask(__name__)
    app.register_blueprint(chat_routes.chat_bp)
    client = app.test_client()

    resp = client.post("/ask", json={"prompt": "greet"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data == {"result": "Hello, Alice! I'm squeaking with joy to meet you."}

