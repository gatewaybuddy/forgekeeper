from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.responses import PlainTextResponse

from forgekeeper_v2.orchestrator.events import JsonlRecorder


def create_app(recorder_path: str | Path = ".forgekeeper-v2/events.jsonl") -> FastAPI:
    app = FastAPI()
    recorder = JsonlRecorder(recorder_path)

    @app.get("/healthz")
    async def healthz() -> PlainTextResponse:  # pragma: no cover
        return PlainTextResponse("ok")

    @app.websocket("/events")
    async def ws_events(ws: WebSocket) -> None:
        await ws.accept()
        existing = recorder.read_all()[-200:]
        for ev in existing:
            await ws.send_text(ev.model_dump_json())
        async for ev in recorder.tail(start_offset=None):
            await ws.send_text(ev.model_dump_json())

    return app


app = create_app()

