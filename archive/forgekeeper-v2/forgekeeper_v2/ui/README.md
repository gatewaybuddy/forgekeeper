This is a minimal UI server and a React scaffolding for Forgekeeper v2.

- `server.py` exposes a FastAPI app with a WebSocket at `/events` streaming the JSONL event tail.
- The `web/` folder contains a minimal Vite+React app (not wired in tests).

To run the server standalone:

```bash
uvicorn forgekeeper_v2.ui.server:app --port 8787 --reload
```

