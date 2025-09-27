#!/usr/bin/env python
from __future__ import annotations

import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MD = ROOT / "Roadmap.md"
OUT = ROOT / "tasks.md"


def parse_tasks(md_text: str) -> list[tuple[str, str, bool]]:
    tasks: list[tuple[str, str, bool]] = []
    phase: str = ""
    phase_re = re.compile(r"^###\s+Phase\s+([\w\.\-]+):\s*(.+?)\s*\(([^\)]+)\)")
    item_re = re.compile(r"^\s*[-*]\s+\[(?P<chk>[ xX])\]\s+(?P<title>.+)$")
    for ln in md_text.splitlines():
        m = phase_re.match(ln)
        if m:
            phase = f"Phase {m.group(1)}: {m.group(2)}"
            continue
        im = item_re.match(ln)
        if im:
            done = im.group("chk").lower() == "x"
            title = im.group("title").strip()
            tasks.append((phase, title, done))
    return tasks


def render(tasks: list[tuple[str, str, bool]]) -> str:
    lines: list[str] = []
    lines.append("# ? Forgekeeper Tasks")
    lines.append("")
    lines.append(
        "> Generated from Roadmap.md. Do not edit directly; update the roadmap and re-generate."
    )
    lines.append("")
    lines.append("## Active & Backlog")
    lines.append("")
    for phase, title, done in tasks:
        if done:
            continue
        lines.append(f"- [ ] {title}  ({phase})")
    lines.append("")
    lines.append("## Completed")
    lines.append("")
    for phase, title, done in tasks:
        if not done:
            continue
        lines.append(f"- [x] {title}  ({phase})")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    if not MD.exists():
        print(f"Roadmap not found: {MD}", file=sys.stderr)
        return 1
    tasks = parse_tasks(MD.read_text(encoding="utf-8"))
    OUT.write_text(render(tasks), encoding="utf-8")
    print(f"Wrote tasks to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

