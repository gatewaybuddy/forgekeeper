# `/api/chat/stream` — Final Turn Streaming (2025-10-20)

Overview
- Runs the server-side tool loop non-streaming, then streams the final assistant turn via SSE.
- Endpoint: `POST /api/chat/stream` (Content-Type: `application/json`).

Request Body (subset)
```json
{
  "messages": [ { "role": "user", "content": "Hello" } ],
  "model": "core",
  "auto_tokens": true
}
```

Example (curl)
```bash
curl -N -X POST http://localhost:5173/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hello."}],"auto_tokens":true}'
```

Events
- `data: { choices: [{ delta: { reasoning_content?, content? } }] }` — normalized deltas.
- `event: fk-orchestration` — one-shot payload with orchestrated conversation and diagnostics.
- `[DONE]` — end marker from upstream is swallowed; connection ends when complete.

Notes
- Rate limiting applies; 429 responses end the stream with a JSON error.
- Tool loop caps and token estimates are documented in `forgekeeper/frontend/server.mjs`.
