from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, WebSocket, Body
from fastapi.responses import PlainTextResponse, HTMLResponse

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

    @app.post("/input")
    async def post_input(payload: dict = Body(...)) -> PlainTextResponse:
        text = str(payload.get("text", "")).strip()
        if not text:
            return PlainTextResponse("ignored", status_code=204)
        from forgekeeper_v2.orchestrator.events import Event, Watermark, JsonlRecorder as JR
        inbox = JR(Path(".forgekeeper-v2/inbox_user.jsonl"))
        ev = Event(seq=0, wm_event_time_ms=Watermark.now_ms(), role="user", stream="ui", act="INPUT", text=text)
        await inbox.append(ev)
        return PlainTextResponse("ok")

    @app.get("/")
    async def index() -> HTMLResponse:
        html = """
<!doctype html>
<meta charset="utf-8" />
<title>Forgekeeper v2 – Events</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; }
  #log { white-space: pre-wrap; font-family: ui-monospace, monospace; }
  .ev { padding:6px; border-bottom: 1px solid #eee; }
  .tool { background: #f7f9ff }
  .bot { background: #fafafa }
  .user { background: #f9fff7 }
  small { opacity: .6 }
  #status { position: fixed; right: 16px; top: 12px; opacity: .7 }
  .live { display:inline-block; width:10px; height:10px; border-radius:6px; background:#2ecc71; margin-right:6px; }
  .dead { background:#e74c3c }
  #controls { position: fixed; bottom: 12px; left: 16px; right: 16px; }
  input { width: 100%; padding: 8px; }
  h1 { margin-top: 0; }
  .acts { opacity: .7 }
  .wm { opacity: .5 }
  </style>
<h1>Forgekeeper v2 – Events</h1>
<div id="status"><span id="live" class="live"></span><span id="wm">wm=0ms</span></div>
<div id="log"></div>
<div id="controls"><input id="inp" placeholder="Type to interrupt… (demo only)"/></div>
<script>
  const log = document.getElementById('log');
  const live = document.getElementById('live');
  const wmEl = document.getElementById('wm');
  const ws = new WebSocket(`ws://${location.host}/events`);
  ws.onopen = () => { live.className = 'live'; };
  ws.onclose = () => { live.className = 'live dead'; };
  ws.onmessage = (m) => {
    try {
      const ev = JSON.parse(m.data);
      wmEl.textContent = `wm=${ev.wm_event_time_ms}ms`;
      const div = document.createElement('div');
      div.className = 'ev ' + (ev.role === 'tool' ? 'tool' : ev.role === 'user' ? 'user' : 'bot');
      div.innerHTML = `<small>#${ev.seq} [${ev.role}/${ev.stream}] <span class=\"acts\">${ev.act}</span> <span class=\"wm\">wm=${ev.wm_event_time_ms}</span></small>\n` +
                      (ev.text || '');
      log.appendChild(div);
      window.scrollTo(0, document.body.scrollHeight);
    } catch {}
  };
  document.getElementById('inp').addEventListener('input', (e) => {
  });
</script>
"""
        return HTMLResponse(content=html)

    return app


app = create_app()
