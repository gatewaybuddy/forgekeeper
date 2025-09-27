#!/usr/bin/env python3
"""
Tail Forgekeeper runtime logs for quick triage.

Default targets:
- .forgekeeper/events.jsonl
- .forgekeeper/agentic_memory.json

Usage examples:
  python forgekeeper/scripts/tail_logs.py --follow
  python forgekeeper/scripts/tail_logs.py --file .forgekeeper/events.jsonl --lines 50 --follow
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


DEFAULT_FILES = [
    Path('.forgekeeper/events.jsonl'),
    Path('.forgekeeper/agentic_memory.json'),
]


def tail_file(path: Path, lines: int, follow: bool) -> int:
    if not path.exists():
        print(f"[WARN] {path} does not exist yet.")
        return 0

    try:
        with path.open('r', encoding='utf-8', errors='replace') as f:
            # Seek to last N lines
            if lines > 0:
                try:
                    f.seek(0, os.SEEK_END)
                    size = f.tell()
                    block = 1024
                    data = ''
                    while size > 0 and data.count('\n') <= lines:
                        step = min(block, size)
                        size -= step
                        f.seek(size)
                        data = f.read(step) + data
                    buf = ''.join(data.splitlines(keepends=True)[-lines:])
                    sys.stdout.write(buf)
                except Exception:
                    # Fall back to reading the whole file
                    f.seek(0)
                    sys.stdout.write(''.join(f.readlines()[-lines:]))
            else:
                sys.stdout.write(f.read())

            if not follow:
                return 0

            # Follow new lines
            while True:
                pos = f.tell()
                chunk = f.read()
                if chunk:
                    sys.stdout.write(chunk)
                    sys.stdout.flush()
                else:
                    time.sleep(0.3)
                    f.seek(pos)
    except KeyboardInterrupt:
        return 0
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Tail Forgekeeper runtime logs')
    parser.add_argument('--file', dest='file', default=None, help='Path to a specific file to tail')
    parser.add_argument('--lines', type=int, default=40, help='Show last N lines before following')
    parser.add_argument('--follow', action='store_true', help='Follow appended content')
    args = parser.parse_args(argv)

    if args.file:
        return tail_file(Path(args.file), args.lines, args.follow)

    # Tail defaults sequentially (non-follow), then follow events.jsonl if requested
    rc = 0
    for p in DEFAULT_FILES:
        print(f"==> {p} <==")
        rc |= tail_file(p, args.lines, follow=False)
        print()

    if args.follow:
        print(f"==> following {DEFAULT_FILES[0]} <==")
        rc |= tail_file(DEFAULT_FILES[0], 0, follow=True)
    return rc


if __name__ == '__main__':
    raise SystemExit(main())

