from flask import Flask
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from forgekeeper.app.routes import chat_routes
import os
os.environ.setdefault("OPENAI_API_KEY", "test-key")
from forgekeeper.app.services import llm_service_openai
from forgekeeper.functions.say_hello import say_hello


def test_openai_tool_call(monkeypatch):
    # Use the OpenAI service for ask_llm
    monkeypatch.setattr(chat_routes, "ask_llm", llm_service_openai.ask_llm)
    monkeypatch.setattr(chat_routes, "functions", {"say_hello": say_hello})

    class DummyResponse:
        def __init__(self):
            class Msg:
                def __init__(self):
                    self.tool_calls = [
                        type(
                            "ToolCall",
                            (),
                            {
                                "function": type(
                                    "Func",
                                    (),
                                    {
                                        "name": "say_hello",
                                        "arguments": '{"name": "Alice"}',
                                    },
                                )(),
                            },
                        )()
                    ]
                    self.content = ""
                    self.function_call = None

            class Choice:
                def __init__(self):
                    self.message = Msg()

            self.choices = [Choice()]

    def fake_create(**kwargs):
        return DummyResponse()

    monkeypatch.setattr(
        llm_service_openai.client.chat.completions, "create", fake_create
    )

    app = Flask(__name__)
    app.register_blueprint(chat_routes.chat_bp)
    client = app.test_client()

    tools = [
        {
            "type": "function",
            "function": {
                "name": "say_hello",
                "description": "say hello",
                "parameters": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}},
                    "required": ["name"],
                },
            },
        }
    ]

    resp = client.post("/ask", json={"prompt": "greet", "tools": tools})
    assert resp.status_code == 200
    assert resp.get_json() == {
        "result": "Hello, Alice! I'm squeaking with joy to meet you."
    }
