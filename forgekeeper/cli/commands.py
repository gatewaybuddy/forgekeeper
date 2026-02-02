"""Command implementations for Forgekeeper CLI."""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

from .environment import get_repo_root
from .stack import run_ensure_stack


def show_logs_help(category: str = "all") -> int:
    """Display log locations and useful commands.

    Args:
        category: Filter category (conversation, system, memory, docker, all)

    Returns:
        Exit code (always 0)
    """
    def print_section(title: str):
        print(f"\n{'='*70}")
        print(f"  {title}")
        print(f"{'='*70}\n")

    if category in ("conversation", "all"):
        print_section("CONVERSATION SPACE LOGS")
        print("📝 Active Conversation Messages:")
        print(f"   Location: .forgekeeper/conversation_spaces/channels/general.jsonl")
        print(f"   Format:   JSONL (one message per line)")
        print(f"   View:     cat .forgekeeper/conversation_spaces/channels/general.jsonl | jq")
        print()

        print("📦 Archived Conversations:")
        print(f"   Location: .forgekeeper/conversation_spaces/archives/")
        print(f"   Example:  general-2025-12-14T02-14-56-766Z.jsonl")
        print(f"   List:     ls -lh .forgekeeper/conversation_spaces/archives/")
        print(f"   View:     cat .forgekeeper/conversation_spaces/archives/<file> | jq")
        print()

        print("🧠 Agent Context/Memory:")
        print(f"   Location: .forgekeeper/conversation_spaces/agent_context/")
        print(f"   Files:    claude.json, chatgpt.json, forge.json, etc.")
        print(f"   View:     cat .forgekeeper/conversation_spaces/agent_context/claude.json | jq")
        print()

        print("⚙️  Agent Configuration:")
        print(f"   Location: .forgekeeper/conversation_spaces/agents.json")
        print(f"   Edit:     vim .forgekeeper/conversation_spaces/agents.json")
        print(f"   Reload:   curl -X POST http://localhost:3000/api/conversation-space/reload-agents")

    if category in ("system", "all"):
        print_section("SYSTEM-WIDE LOGS")
        print("📊 ContextLog (Event Telemetry):")
        print(f"   Location: .forgekeeper/context_log/")
        print(f"   Format:   ctx-YYYYMMDD-HH.jsonl (rotates hourly)")
        print(f"   Tail:     tail -f .forgekeeper/context_log/ctx-*.jsonl | jq")
        print(f"   Latest:   ls -t .forgekeeper/context_log/*.jsonl | head -1 | xargs cat | jq")
        print()

        print("📈 Scout Metrics (Performance):")
        print(f"   Location: .forgekeeper/scout_metrics/scout-performance.jsonl")
        print(f"   View:     cat .forgekeeper/scout_metrics/scout-performance.jsonl | jq")
        print()

        print("🔧 Tool Audit Log:")
        print(f"   Location: .forgekeeper/tools_audit.jsonl")
        print(f"   View:     cat .forgekeeper/tools_audit.jsonl | jq")

    if category in ("memory", "all"):
        print_section("MEMORY SYSTEMS")
        print("💾 Episodic Memory:")
        print(f"   Locations:")
        print(f"     - .forgekeeper/consciousness/memory/.episodic_memory.jsonl")
        print(f"     - .forgekeeper/memory/episodic.jsonl")
        print(f"     - .forgekeeper/thought_world/memory/episodes.jsonl")
        print()

        print("👤 User Preferences:")
        print(f"   Location: .forgekeeper/preferences/*.jsonl")
        print(f"   List:     ls .forgekeeper/preferences/")
        print()

        print("📚 Learning Outcomes:")
        print(f"   Location: .forgekeeper/learning/outcomes.jsonl")

    if category in ("docker", "all"):
        print_section("DOCKER CONTAINER LOGS")
        print("🐳 View Live Logs:")
        print(f"   All:      docker compose logs --follow")
        print(f"   Frontend: docker compose logs frontend --tail 100 --follow")
        print(f"   Core:     docker compose logs llama-core --tail 100 --follow")
        print()

        print("🔍 Search Logs:")
        print(f"   Errors:   docker compose logs frontend | grep -i error")
        print(f"   Agents:   docker compose logs frontend | grep -E '(Hot-reload|Starting|Stopping)'")
        print(f"   API:      docker compose logs frontend | grep 'POST\\|GET\\|PUT\\|DELETE'")
        print()

        print("📝 Container Info:")
        print(f"   Status:   docker compose ps")
        print(f"   Inspect:  docker inspect forgekeeper-frontend-1")

    if category == "all":
        print_section("USEFUL COMMANDS")
        print("🔄 Agent Management:")
        print(f"   Reload agents:     curl -X POST http://localhost:3000/api/conversation-space/reload-agents")
        print(f"   List agents:       curl http://localhost:3000/api/conversation-space/agents | jq")
        print(f"   Agent status:      curl http://localhost:3000/api/conversation-space/status | jq")
        print()

        print("🗂️  Data Management:")
        print(f"   Archive chat:      curl -X POST http://localhost:3000/api/conversation-space/channels/general/archive")
        print(f"   List archives:     curl http://localhost:3000/api/conversation-space/channels/general/archives | jq")
        print()

        print("🔧 System Health:")
        print(f"   Frontend health:   curl http://localhost:3000/health-ui")
        print(f"   Core models:       curl http://localhost:8001/v1/models | jq")
        print()

        print("💡 Tips:")
        print(f"   - All JSONL files can be piped to 'jq' for pretty-printing")
        print(f"   - Use 'tail -f' to watch logs in real-time")
        print(f"   - Grep with -E for extended regex patterns")
        print(f"   - Add '| grep -v noise' to filter out unwanted lines")

    print(f"\n{'='*70}\n")
    print(f"💡 Pro tip: Run 'python -m forgekeeper logs --category <type>' to filter")
    print(f"   Categories: conversation, system, memory, docker, all")
    print()

    return 0


def run_chat(
    prompt: str,
    base_url: str | None,
    model: str | None,
    no_stream: bool,
    tools: str | None = None,
    workdir: str | None = None,
    system: str | None = None
) -> int:
    """Run interactive chat with the LLM.

    Args:
        prompt: User prompt text
        base_url: API base URL (default: FK_CORE_API_BASE env var)
        model: Model name (default: VLLM_MODEL_CORE env var)
        no_stream: Disable streaming
        tools: Enable tool calling demo
        workdir: Workspace root for tools
        system: System prompt override

    Returns:
        Exit code
    """
    # Tools demo path (Python-only) when --tools is provided
    if tools:
        try:
            from openai import OpenAI  # type: ignore
        except Exception:
            print("openai package not installed. Try: pip install openai", file=sys.stderr)
            return 1

        base = base_url or os.getenv("FK_CORE_API_BASE", "http://localhost:8001")
        api_base = base.rstrip('/') + '/v1'
        client = OpenAI(base_url=api_base, api_key=os.getenv("OPENAI_API_KEY", "dev-key"))
        mdl = model or os.getenv("VLLM_MODEL_CORE", "local")

        # Restrict the tool to a safe workspace root
        repo_root = get_repo_root()
        safe_root = Path(workdir).resolve() if workdir else repo_root
        try:
            safe_root = safe_root.resolve()
        except Exception:
            safe_root = repo_root

        def _list_dir(arg_path: str | None) -> str:
            """List directory contents within safe root."""
            p = Path(arg_path or ".")
            if not p.is_absolute():
                p = (safe_root / p).resolve()
            # Ensure path stays within safe_root
            try:
                p.relative_to(safe_root)
            except Exception:
                return f"Refusing to list outside of {safe_root}"
            if not p.exists() or not p.is_dir():
                return f"Path not found or not a directory: {p}"

            entries = []
            for i, e in enumerate(p.iterdir()):
                if i >= 50:
                    entries.append("... (truncated)")
                    break
                kind = "dir" if e.is_dir() else "file"
                try:
                    sz = e.stat().st_size if e.is_file() else 0
                except Exception:
                    sz = 0
                entries.append(f"{kind}\t{e.name}\t{sz}")
            return f"Listing of {p} (max 50):\n" + "\n".join(entries)

        tools_spec = [
            {
                "type": "function",
                "function": {
                    "name": "list_dir",
                    "description": "List files in a directory within the local workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Relative path from workspace root"}
                        },
                        "required": []
                    },
                },
            }
        ]

        system = system or (
            "You are a local development assistant. Use the provided tools when helpful. "
            "Do not mention or reference any policy documents. If a tool result is long, summarize succinctly."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]

        # Tool calling loop (max 3 iterations)
        for _ in range(3):
            resp = client.chat.completions.create(
                model=mdl,
                messages=messages,
                tools=tools_spec,
                tool_choice="auto",
                temperature=0.2,
                max_tokens=256,
            )
            choice = resp.choices[0]
            msg = choice.message
            tc = getattr(msg, "tool_calls", None)

            if tc:
                for call in tc:
                    fname = call.function.name
                    try:
                        args = json.loads(call.function.arguments or "{}")
                    except Exception:
                        args = {}

                    if fname == "list_dir":
                        out = _list_dir(args.get("path"))
                    else:
                        out = f"Tool {fname} not implemented."

                    messages.append({"role": "tool", "tool_call_id": call.id, "content": out})
                # Continue loop to let model observe tool results
                continue

            # No tool calls -> final answer
            content = getattr(msg, "content", None)
            print(content or "")
            return 0

        # Fallback if tools loop didn't converge
        print("(tools) no final answer produced", file=sys.stderr)
        return 1

    # Non-tools path: delegate to platform-specific chat script
    root = get_repo_root()
    if platform.system() == "Windows":
        ps1 = root / "scripts" / "chat_reasoning.ps1"
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if not shell or not ps1.exists():
            print("PowerShell chat script not found; ensure pwsh and scripts/chat_reasoning.ps1 exist", file=sys.stderr)
            return 1

        cmd = [shell, "-NoLogo", "-NoProfile", "-File", str(ps1), "-Prompt", prompt]
        if base_url:
            cmd += ["-BaseUrl", base_url]
        if model:
            cmd += ["-Model", model]
        if no_stream:
            cmd += ["-NoStream"]
        if system:
            cmd += ["-System", system]
        return subprocess.call(cmd)
    else:
        # Python fallback using test harness
        py = shutil.which("python3") or shutil.which("python") or sys.executable
        script = root / "scripts" / "test_harmony_basic.py"
        env = os.environ.copy()
        if base_url:
            env["FK_CORE_API_BASE"] = base_url
        if model:
            env["VLLM_MODEL_CORE"] = model
        return subprocess.call([py, str(script)], env=env)


def run_switch_core(kind: str, no_restart: bool = False) -> int:
    """Switch between llama.cpp and vLLM inference cores.

    Args:
        kind: Target core ('llama' or 'vllm')
        no_restart: If True, only update .env without restarting stack

    Returns:
        Exit code
    """
    root = get_repo_root()
    env_path = root / ".env"
    target = kind.strip().lower()

    # Update .env file
    try:
        text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    except Exception:
        text = ""

    lines = text.splitlines() if text else []
    out_lines: list[str] = []
    saw_kind = False
    saw_api = False

    for line in lines:
        s = line.strip()
        if s.startswith("FK_CORE_KIND="):
            out_lines.append(f"FK_CORE_KIND={target}")
            saw_kind = True
        elif s.startswith("FK_CORE_API_BASE="):
            base = "http://llama-core:8000" if target == "llama" else "http://vllm-core:8000"
            out_lines.append(f"FK_CORE_API_BASE={base}")
            saw_api = True
        else:
            out_lines.append(line)

    if not saw_kind:
        out_lines.append(f"FK_CORE_KIND={target}")
    if not saw_api:
        base = "http://llama-core:8000" if target == "llama" else "http://vllm-core:8000"
        out_lines.append(f"FK_CORE_API_BASE={base}")

    try:
        env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    except Exception as e:
        print(f"Failed to update {env_path}: {e}", file=sys.stderr)
        return 1

    print(f"Updated {env_path} → FK_CORE_KIND={target}")

    if no_restart:
        return 0

    # Stop the opposite core to avoid port conflicts
    opposite = "vllm-core" if target == "llama" else "llama-core"
    docker = shutil.which("docker") or "docker"
    try:
        subprocess.call([docker, "compose", "-f", str(root / "docker-compose.yml"), "stop", opposite])
    except Exception:
        pass

    # Restart stack with selected profiles
    os.environ["FK_CORE_KIND"] = target
    profiles = ["ui", "inference"] if target == "llama" else ["ui", "inference-vllm"]
    rc = run_ensure_stack(build=False, include_mongo=False, profiles=profiles, compose_file="docker-compose.yml")

    if rc != 0:
        print("Failed to restart stack; try running 'python -m forgekeeper compose'", file=sys.stderr)
    else:
        core_port = os.getenv("LLAMA_PORT_CORE") if target == "llama" else os.getenv("VLLM_PORT_CORE")
        core_port = core_port or "8001"
        print(f"Switched core to {target}. Core API: http://localhost:{core_port}/v1")

    return rc


def run_consciousness_repl() -> int:
    """Start the consciousness system REPL.

    Returns:
        Exit code
    """
    try:
        from forgekeeper.consciousness_repl import main as repl_main
        return repl_main()
    except Exception:
        print("Consciousness REPL not available", file=sys.stderr)
        return 1


__all__ = [
    "show_logs_help",
    "run_chat",
    "run_switch_core",
    "run_consciousness_repl",
]
