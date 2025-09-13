# Forgekeeper v2 – Thoughtworld Orchestrator

Forgekeeper v2 is a continuous inner-dialogue runtime that coordinates two LLM agents (Strategist and Implementer), live user interrupts, and multiple tool streams (including PowerShell) as first-class conversational participants. The shared "inner mind" is an append-only JSONL event bus with watermarks, speech-acts, and sequencing.

Highlights:
- Two LLMs with time-sliced floor control and preemption on user input
- Event JSONL bus with watermarks for easy tailing and UI presentation
- Trigger policies (time/size) with simple hysteresis
- Tool adapters with streaming stdout/stderr (PowerShell-first, shell fallback)
- Minimal Memory Plane (rolling summaries, facts, corrections)
- Local FastAPI server with WebSocket event stream and a simple React UI scaffolding
- Demo script and tests using mock LLMs; real PowerShell on Windows when available

## Quickstart

Prereqs: Python 3.11+, `pip`, and optionally PowerShell (`powershell.exe` on Windows or `pwsh` on macOS/Linux).

1) Install deps (editable):

```bash
pip install -e ./forgekeeper-v2
```

2) Run via CLI (recommended):

```bash
forgekeeper-v2 demo --duration 8
```

or run the demo module directly:

```bash
python forgekeeper-v2/scripts/demo_duet.py
```

3) Check and install missing deps on demand:

```bash
forgekeeper-v2 check --install-yes
```

4) Run tests:

```bash
pytest -q forgekeeper-v2/tests
```

Notes:
- On Windows, the PowerShell adapter uses `powershell.exe -NoLogo -NoProfile`.
- On macOS/Linux, it attempts `pwsh -NoLogo -NoProfile`, falls back to `/bin/sh` if not available.

## Package Entrypoints

- Orchestrator module: `from forgekeeper_v2.orchestrator.orchestrator import Orchestrator`
- Event bus: `forgekeeper_v2.orchestrator.events`
- Tool adapters: `forgekeeper_v2.orchestrator.adapters.*`
- UI server: `forgekeeper_v2.ui.server:create_app`

## Security Model

- Tools are sandboxed by default; no destructive commands are auto-sent.
- Output is lightly redacted for common secret patterns.
- Orchestrator enforces a small allowlist before dispatching proposed actions.

## CI

See `.github/workflows/forgekeeper-v2.yml` for a minimal pytest + CLI workflow.

