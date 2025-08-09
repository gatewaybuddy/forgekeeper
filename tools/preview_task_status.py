import os, re, sys, json, subprocess
from typing import List, Dict, Any

try:
    import yaml  # PyYAML
except Exception:
    print("Missing dependency: pyyaml", file=sys.stderr)
    sys.exit(2)

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL|re.MULTILINE)
TASK_ID_RE = re.compile(r"\b(FK-\d+)\b", re.IGNORECASE)

def parse_tasks_md(path: str) -> Dict[str, Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    tasks = {}
    idx = 0
    while True:
        m = FRONTMATTER_RE.search(text, idx)
        if not m:
            break
        fm = yaml.safe_load(m.group(1)) or {}
        start, end = m.span()
        next_m = FRONTMATTER_RE.search(text, end)
        body = text[end: next_m.start() if next_m else len(text)].strip()
        tid = str(fm.get("id"))
        if tid:
            tasks[tid] = {
                "id": tid,
                "title": fm.get("title","" ).strip(),
                "status": (fm.get("status") or "todo").strip(),
                "epic": fm.get("epic"),
                "labels": fm.get("labels") or [],
                "owner": fm.get("owner"),
                "body": body
            }
        idx = end
    return tasks

def gh(*args, **kw) -> str:
    # Prefer gh CLI if present; else use curl (Actions has gh)
    return subprocess.check_output(args, text=True, **kw).strip()

def main():
    event_path = os.getenv("GITHUB_EVENT_PATH")
    if not event_path:
        print("GITHUB_EVENT_PATH missing", file=sys.stderr); sys.exit(2)
    event = json.load(open(event_path, "r", encoding="utf-8"))
    pr = event.get("pull_request") or {}
    pr_number = pr.get("number")
    title = pr.get("title","")
    body = pr.get("body") or ""
    head_ref = pr.get("head",{}).get("ref","")

    # Collect task IDs referenced in title/body/branch name
    candidates = set()
    for blob in (title, body, head_ref):
        for m in TASK_ID_RE.findall(blob or ""):
            candidates.add(m.upper())

    tasks_path = "tasks.md"
    if not os.path.exists(tasks_path):
        print("tasks.md not found; nothing to preview")
        print("::set-output name=markdown::No tasks.md found.")
        return

    tasks = parse_tasks_md(tasks_path)

    # Current statuses for referenced tasks
    rows = []
    for tid in sorted(candidates):
        t = tasks.get(tid)
        if not t:
            rows.append((tid, "(not found in tasks.md)", "—", "—"))
            continue
        current = t["status"]
        # Predict post-merge: if this PR merges and references the task, assume done
        predicted = "done"
        rows.append((tid, t["title"], current, predicted))

    # If nothing referenced, heuristically match by PR title words
    if not rows:
        # Try loose title match
        title_l = title.lower()
        for t in tasks.values():
            if t["status"] in ("todo","in_progress") and all(w in (t["title"] or "").lower() for w in title_l.split()[:3]):
                rows.append((t["id"], t["title"], t["status"], "in_progress"))
                break

    def render_table(rows):
        if not rows:
            return "_No related tasks detected. Add an FK-123 ID to the PR title or branch._"
        head = "| Task | Title | Current | Predicted after merge |\n|---|---|---|---|"
        lines = [head]
        for tid, title, cur, pred in rows:
            lines.append(f"| {tid} | {title} | `{cur}` | **{pred}** |")
        return "\n".join(lines)

    note = (
        "> This is a preview and does **not** write to `tasks.md`. "
        "Actual status changes occur when the `roadmap-sync` workflow runs on `main`."
    )
    md = f"""### 🧭 Roadmap Preview
PR: #{pr_number}

{render_table(rows)}

{note}

_Refs: `tools/preview_task_status.py`_
"""
    # Write to file for the workflow step to pick up
    with open("PR_PREVIEW.md","w",encoding="utf-8") as f:
        f.write(md)
    print(md)

if __name__ == "__main__":
    main()
