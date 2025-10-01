#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Dict, Optional, Tuple

RE_TASK_HEADER = re.compile(r"^###\s+(T\d+)\s+[-\u2014]\s+", re.MULTILINE)
RE_FIELD = {
    "goal": re.compile(r"^-\s+Goal:\s*", re.IGNORECASE | re.MULTILINE),
    "scope": re.compile(r"^-\s+Scope:\s*", re.IGNORECASE | re.MULTILINE),
    "oos": re.compile(r"^-\s+Out of Scope:\s*", re.IGNORECASE | re.MULTILINE),
    "allowed": re.compile(r"^-\s+Allowed Touches:\s*", re.IGNORECASE | re.MULTILINE),
    "done": re.compile(r"^-\s+Done When:\s*", re.IGNORECASE | re.MULTILINE),
    "test": re.compile(r"^-\s+Test Level:\s*", re.IGNORECASE | re.MULTILINE),
}

CODE_SPAN = re.compile(r"`([^`]+)`")


@dataclass
class TaskCard:
    task_id: str
    text: str
    fields_present: Dict[str, bool]
    allowed_globs: List[str]


def read_tasks_md(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"tasks file not found: {path}")
    return path.read_text(encoding="utf-8")


def split_cards(markdown: str) -> Dict[str, TaskCard]:
    cards: Dict[str, TaskCard] = {}
    headers = list(RE_TASK_HEADER.finditer(markdown))
    for i, m in enumerate(headers):
        start = m.start()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(markdown)
        chunk = markdown[start:end]
        task_id = m.group(1)
        fields = {k: bool(RE_FIELD[k].search(chunk)) for k in RE_FIELD}
        allowed_line = _extract_allowed_line(chunk)
        allowed_globs = CODE_SPAN.findall(allowed_line) if allowed_line else []
        cards[task_id] = TaskCard(task_id=task_id, text=chunk, fields_present=fields, allowed_globs=allowed_globs)
    return cards


def _extract_allowed_line(chunk: str) -> str:
    for line in chunk.splitlines():
        if RE_FIELD["allowed"].search(line):
            return line
    return ""


def lint_cards(cards: Dict[str, TaskCard]) -> Tuple[bool, List[str]]:
    ok = True
    problems: List[str] = []
    for card in cards.values():
        missing = [k for k, present in card.fields_present.items() if not present]
        if missing:
            ok = False
            problems.append(f"{card.task_id}: missing fields: {', '.join(missing)}")
        if not card.allowed_globs:
            ok = False
            problems.append(f"{card.task_id}: Allowed Touches has no code paths (wrap paths in backticks)")
    return ok, problems


def git(*args: str, check=True) -> str:
    res = subprocess.run(["git", *args], capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout.strip()


def ensure_commit_available(sha: str) -> None:
    if not sha:
        return
    if subprocess.run(["git", "cat-file", "-e", sha], capture_output=True).returncode == 0:
        return
    # Fetch by explicit SHA
    subprocess.run(["git", "fetch", "--no-tags", "--depth=1", "origin", sha], check=False)


def changed_files_between(base: str, head: str) -> List[str]:
    ensure_commit_available(base)
    ensure_commit_available(head)
    out = git("diff", "--name-only", f"{base}..{head}")
    return [line for line in out.splitlines() if line.strip()]


def changed_files_staged() -> List[str]:
    out = git("diff", "--name-only", "--cached")
    return [line for line in out.splitlines() if line.strip()]


ALWAYS_ALLOWED = [
    ".github/**",
    "ROADMAP.md",
    "tasks.md",
    "README.md",
    "docs/**",
    "CONTRIBUTING.md",
    "Makefile",
    "logs/**",
    ".forgekeeper/**",
]


def glob_match(paths: Iterable[str], pattern: str) -> List[str]:
    return [p for p in paths if Path(p).match(pattern)]


def check_allowed_touches(changed: List[str], allowed: List[str], extra_allow: List[str]) -> Tuple[bool, List[str]]:
    patterns = list(allowed) + ALWAYS_ALLOWED + list(extra_allow)
    unmatched = []
    for p in changed:
        if any(Path(p).match(glob) for glob in patterns):
            continue
        unmatched.append(p)
    return len(unmatched) == 0, unmatched


def infer_task_id_from_text(text: str) -> Optional[str]:
    m = re.search(r"Task\s*ID\s*:\s*(T\d+)", text, re.IGNORECASE)
    if m:
        return m.group(1)
    m2 = re.search(r"\b(T\d+)\b", text)
    return m2.group(1) if m2 else None


def load_event(path: Path) -> Dict:
    return json.loads(path.read_text(encoding="utf-8"))


def cmd_lint_cards(args: argparse.Namespace) -> int:
    md = read_tasks_md(Path(args.tasks_md))
    cards = split_cards(md)
    ok, problems = lint_cards(cards)
    for p in problems:
        print(f"[task-sanity] {p}")
    print(f"[task-sanity] Checked {len(cards)} task cards; status={'ok' if ok else 'fail'}")
    return 0 if ok else 1


def cmd_check_pr(args: argparse.Namespace) -> int:
    md = read_tasks_md(Path(args.tasks_md))
    cards = split_cards(md)
    task_id = args.task_id
    pr_text = ""
    base_sha = args.base_sha
    head_sha = args.head_sha

    if args.from_event:
        ev = load_event(Path(args.from_event))
        pr = ev.get("pull_request", {})
        pr_text = (pr.get('title', '') or '') + "\n" + (pr.get('body', '') or '')
        if not task_id:
            task_id = infer_task_id_from_text(pr_text)
        base_sha = base_sha or pr.get("base", {}).get("sha")
        head_sha = head_sha or pr.get("head", {}).get("sha")

    if not task_id:
        print("[task-sanity] ERROR: Unable to determine Task ID (expected 'Task ID: T#' in PR).", file=sys.stderr)
        return 2

    card = cards.get(task_id)
    if not card:
        print(f"[task-sanity] ERROR: Task {task_id} not found in tasks.md", file=sys.stderr)
        return 2

    missing = [k for k, v in card.fields_present.items() if not v]
    if missing:
        print(f"[task-sanity] ERROR: Task {task_id} missing fields: {', '.join(missing)}", file=sys.stderr)
        return 2

    # Determine changed files
    if args.against == "range":
        if not base_sha or not head_sha:
            print("[task-sanity] ERROR: base/head SHAs required for --against range", file=sys.stderr)
            return 2
        changed = changed_files_between(base_sha, head_sha)
    elif args.against == "staged":
        changed = changed_files_staged()
    else:
        print(f"[task-sanity] ERROR: unknown --against {args.against}", file=sys.stderr)
        return 2

    extra = [s for s in (os.getenv("TASK_SANITY_EXTRA_ALLOW", "").split(",")) if s]
    ok, unmatched = check_allowed_touches(changed, card.allowed_globs, extra)
    if not ok:
        msg = (
            f"[task-sanity] ERROR: Files outside Allowed Touches for {task_id}:\n"
            + "\n".join([f"  - {u}" for u in unmatched])
        )
        print(msg, file=sys.stderr)
        print("[task-sanity] Allowed patterns:")
        for g in card.allowed_globs:
            print(f"  - {g}")
        print("[task-sanity] Add exceptions via TASK_SANITY_EXTRA_ALLOW, or split work into another task.")
        return 3

    print(f"[task-sanity] OK: {task_id} — {len(changed)} changed file(s) within Allowed Touches")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Forgekeeper task sanity checks")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_lint = sub.add_parser("lint-cards", help="Verify each task card has required fields")
    ap_lint.add_argument("--tasks-md", default="tasks.md")
    ap_lint.set_defaults(func=cmd_lint_cards)

    ap_check = sub.add_parser("check-pr", help="Enforce Allowed Touches for a PR/task")
    ap_check.add_argument("--tasks-md", default="tasks.md")
    ap_check.add_argument("--task-id", help="Explicit task id (e.g., T7)")
    ap_check.add_argument("--from-event", help="Path to GitHub event JSON (pull_request)")
    ap_check.add_argument("--base-sha", help="Base commit SHA for diff")
    ap_check.add_argument("--head-sha", help="Head commit SHA for diff")
    ap_check.add_argument("--against", choices=["range", "staged"], default="range")
    ap_check.set_defaults(func=cmd_check_pr)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
