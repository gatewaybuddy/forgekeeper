#!/usr/bin/env python
from __future__ import annotations

import re
from pathlib import Path
import sys
import datetime as _dt

ROOT = Path(__file__).resolve().parents[1]
MD = ROOT / "Roadmap.md"
YAML = ROOT / "roadmap.yaml"


def parse(md_text: str) -> dict:
    data: dict[str, object] = {
        "generated_at": _dt.datetime.utcnow().isoformat() + "Z",
        "source": "Roadmap.md",
        "phases": [],
    }
    phases: list[dict] = []
    cur: dict | None = None

    lines = md_text.splitlines()
    phase_re = re.compile(r"^###\s+Phase\s+(?P<num>[\w\.\-]+):\s*(?P<title>.+?)\s*\((?P<status>[^\)]+)\)")
    item_re = re.compile(r"^\s*[-*]\s+\[(?P<chk>[ xX])\]\s+(?P<title>.+)$")
    for ln in lines:
        m = phase_re.match(ln)
        if m:
            if cur:
                phases.append(cur)
            cur = {
                "id": f"phase-{m.group('num').lower()}",
                "name": m.group("title").strip(),
                "status": m.group("status").strip().lower(),
                "items": [],
            }
            continue
        if cur:
            im = item_re.match(ln)
            if im:
                cur["items"].append({
                    "title": im.group("title").strip(),
                    "done": im.group("chk").lower() == "x",
                })
    if cur:
        phases.append(cur)
    data["phases"] = phases
    return data


def to_yaml(obj: object, indent: int = 0) -> str:
    sp = "  " * indent
    if isinstance(obj, dict):
        out = []
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                out.append(f"{sp}{k}:")
                out.append(to_yaml(v, indent + 1))
            else:
                vv = "true" if v is True else "false" if v is False else v
                out.append(f"{sp}{k}: {vv}")
        return "\n".join(out)
    if isinstance(obj, list):
        out = []
        for it in obj:
            if isinstance(it, (dict, list)):
                out.append(f"{sp}-")
                out.append(to_yaml(it, indent + 1))
            else:
                out.append(f"{sp}- {it}")
        return "\n".join(out)
    return f"{sp}{obj}"


def main() -> int:
    if not MD.exists():
        print(f"Roadmap not found: {MD}", file=sys.stderr)
        return 1
    data = parse(MD.read_text(encoding="utf-8"))
    yaml_text = to_yaml(data) + "\n"
    YAML.write_text(yaml_text, encoding="utf-8")
    print(f"Wrote {YAML}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

