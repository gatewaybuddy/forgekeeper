# Changelog

## 2025-10-05

- Default GPU core via llama.cpp `server-cuda` and `--jinja` enabled for OpenAI `tools`.
- Robust GPU detection and health wait in `scripts/start_gpu.ps1`.
- Fixed PowerShell streaming parser in `chat_reasoning.ps1`.
- Frontend tool orchestration: preserve `assistant.tool_calls` and sanitize orphan tool messages (prevents Jinja template 500s).
- Enabled `run_powershell` tool (gated by env) with runtime toggles at `/api/tools/config`.
- Upgraded Tools Diagnostics (args, timing, output preview) and pairing badges in transcript.
- UI cleanup: moved System Prompt and Tools Settings under a hamburger menu with modal overlays.
- Added generation controls (Max output tokens, Continue tokens, Continue attempts) and persistence.
- Increased default output token budgets and added multi-continue streaming loop.
- CLI: `--tools dir` demo and `--system` override. Added tests for basic chat and PS streaming.

