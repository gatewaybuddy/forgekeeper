from flask import Flask

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from forgekeeper.functions.write_file import write_file
from forgekeeper.app.routes import chat_routes


def test_harmony_tool_call(tmp_path, monkeypatch):
    target = tmp_path / "out.txt"
    # Simulated Harmony tool call output from gpt-oss-20b
    harmony_output = (
        "<|start|>assistant<|channel|>commentary to=functions.write_file"
        "<|constrain|>json<|message|>{" +
        f"\"path\": \"{str(target)}\", \"content\": \"hello\"}}<|call|>"
    )

    monkeypatch.setattr(chat_routes, "ask_llm", lambda prompt: harmony_output)
    monkeypatch.setattr(
        chat_routes, "load_functions", lambda directory="functions": {"write_file": write_file}
    )
    monkeypatch.setattr(chat_routes, "functions", None)

    app = Flask(__name__)
    app.register_blueprint(chat_routes.chat_bp)
    client = app.test_client()

    resp = client.post("/ask", json={"prompt": "write a file"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data == {"result": {"result": "success"}}
    assert target.read_text() == "hello"
