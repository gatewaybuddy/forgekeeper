from __future__ import annotations

import curses
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from forgekeeper.app.chats.chat_session import ChatSession


CFG_PATH = Path('.forgekeeper/runtime_config.json')


def _load_cfg() -> dict:
    try:
        return json.loads(CFG_PATH.read_text(encoding='utf-8'))
    except Exception:
        return {}


def _save_cfg_patch(patch: dict) -> None:
    current = _load_cfg()
    current.update(patch)
    CFG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CFG_PATH.write_text(json.dumps(current, indent=2), encoding='utf-8')


def _count_tokens(text: str) -> int:
    if not text:
        return 0
    # Lightweight heuristic
    parts = [p for p in text.strip().replace('\r', '\n').split() if p]
    return len(parts)


@dataclass
class UIState:
    lines: List[str] = field(default_factory=list)
    input: List[str] = field(default_factory=list)
    show_context: bool = True
    context_limit: int = 8192


HELP = (
    "/model <name> | /temperature <0..2> | /top_p <0..1> | "
    "/backend <openai|transformers> | /gateway <url> | "
    "/context on|off|<limit> | /restart | /reset | /help"
)


def run_chat_tui(stdscr: 'curses._CursesWindow', session_id: str) -> None:
    curses.curs_set(1)
    stdscr.nodelay(False)
    stdscr.keypad(True)

    ui = UIState()
    cfg = _load_cfg()
    if 'show_context' in cfg:
        ui.show_context = (cfg['show_context'] != 'off')
    if 'context_limit' in cfg:
        try:
            ui.context_limit = int(cfg['context_limit'])
        except Exception:
            pass

    chat = ChatSession(session_id)

    def redraw():
        stdscr.erase()
        max_y, max_x = stdscr.getmaxyx()
        # Output area (everything except last 3 rows)
        out_h = max_y - 3
        # Render last lines
        visible = ui.lines[-out_h:]
        y = 0
        for line in visible:
            stdscr.addnstr(y, 0, line, max_x - 1)
            y += 1
        # Input area divider
        stdscr.hline(out_h, 0, curses.ACS_HLINE, max_x)
        # Input buffer
        input_text = "\n".join(ui.input) if ui.input else ''
        stdscr.addnstr(out_h + 1, 0, input_text, max_x - 1)
        # Status line: context counter and hint
        msgs = chat.history
        history_text = "\n".join(f"{m['role']}: {m.get('content','')}" for m in msgs)
        total = _count_tokens(f"{history_text}\n{input_text}")
        remaining = max(0, ui.context_limit - total)
        status = f"Context: {total}/{ui.context_limit} (remaining {remaining})  —  Send: Enter, Newline: Ctrl+J, Help: /help"
        if not ui.show_context:
            status = "Help: /help — Newline: Ctrl+J, Send: Enter"
        stdscr.addnstr(out_h + 2, 0, status, max_x - 1)
        stdscr.refresh()

    def add_output(text: str) -> None:
        for ln in text.splitlines() or ['']:
            ui.lines.append(ln)

    redraw()
    while True:
        ch = stdscr.get_wch()
        if isinstance(ch, str):
            if ch == '\n':  # Enter: send
                input_text = "\n".join(ui.input).strip()
                if input_text:
                    if input_text.startswith('/'):
                        parts = input_text[1:].split()
                        cmd = (parts[0].lower() if parts else '')
                        arg = " ".join(parts[1:])
                        if cmd == 'model':
                            _save_cfg_patch({'model': arg})
                            add_output(f"[cfg] model = {arg}")
                        elif cmd == 'temperature':
                            _save_cfg_patch({'temperature': float(arg or 0)})
                            add_output(f"[cfg] temperature = {arg}")
                        elif cmd == 'top_p':
                            _save_cfg_patch({'top_p': float(arg or 1)})
                            add_output(f"[cfg] top_p = {arg}")
                        elif cmd == 'backend':
                            _save_cfg_patch({'backend': arg})
                            add_output(f"[cfg] backend = {arg}")
                        elif cmd == 'gateway':
                            _save_cfg_patch({'gateway': arg})
                            add_output(f"[cfg] gateway = {arg}")
                        elif cmd == 'context':
                            if arg in ('on','off'):
                                ui.show_context = (arg == 'on')
                                _save_cfg_patch({'show_context': arg})
                                add_output(f"[cfg] show_context = {arg}")
                            elif arg:
                                try:
                                    ui.context_limit = int(arg)
                                    _save_cfg_patch({'context_limit': ui.context_limit})
                                    add_output(f"[cfg] context_limit = {arg}")
                                except Exception:
                                    add_output("Usage: /context on|off|<limit>")
                        elif cmd == 'reset':
                            _save_cfg_patch({'model': None, 'temperature': None, 'top_p': None, 'backend': None, 'gateway': None})
                            add_output("[cfg] reset (values cleared; env defaults may apply)")
                        elif cmd == 'restart':
                            flag = Path('.forgekeeper/restart.flag')
                            flag.parent.mkdir(parents=True, exist_ok=True)
                            flag.write_text('requested', encoding='utf-8')
                            add_output('[cfg] restart requested (create flag). Exit and relaunch to apply.')
                        elif cmd == 'help':
                            add_output(HELP)
                        else:
                            add_output(f"Unknown command: /{cmd}")
                    else:
                        add_output(f"you: {input_text}")
                        try:
                            chat.user_prompt(input_text)
                            resp = chat.generate_response()
                            content = resp if isinstance(resp, str) else (resp.get('content') if isinstance(resp, dict) else str(resp))
                            if content:
                                add_output(f"ai: {content}")
                        except Exception as e:
                            add_output(f"[error] {e}")
                ui.input = []
                redraw()
            elif ch == '\t':
                # Ignore tabs
                pass
            else:
                # Regular character
                if not ui.input:
                    ui.input.append('')
                ui.input[-1] += ch
                redraw()
        else:
            # Special keys
            if ch == curses.KEY_BACKSPACE or ch == 127:
                if ui.input:
                    if ui.input[-1]:
                        ui.input[-1] = ui.input[-1][:-1]
                    else:
                        ui.input.pop()
                redraw()
            elif ch == curses.KEY_ENTER:
                # Treat as send
                stdscr.ungetch('\n')
            elif ch == curses.KEY_DOWN:
                ui.input.append('')
                redraw()
            elif ch == 10:  # Ctrl+J inserts newline in many terminals
                ui.input.append('')
                redraw()


def main(argv: list[str] | None = None) -> int:
    session = os.environ.get('FK_SESSION', 'default')
    if argv and len(argv) >= 1:
        session = argv[0]
    try:
        curses.wrapper(run_chat_tui, session)
        return 0
    except Exception as exc:
        sys.stderr.write(f"chat tui failed: {exc}\n")
        return 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))

