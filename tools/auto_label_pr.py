import os, re, sys, json, subprocess
from typing import List, Dict, Any, Set

try:
    import yaml  # PyYAML
except Exception:
    print("Missing dependency: pyyaml", file=sys.stderr)
    sys.exit(2)

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL|re.MULTILINE)
TASK_ID_RE = re.compile(r"\b(FK-\d+)\b", re.IGNORECASE)
PRIORITY_PAT = re.compile(r"\((P[0-3])\)", re.IGNORECASE)

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
            tasks[tid.upper()] = {
                "id": tid.upper(),
                "title": (fm.get("title") or "").strip(),
                "labels": fm.get("labels") or [],
                "body": body,
            }
        idx = end
    return tasks

def repo_slug_from_git() -> str:
    url = subprocess.check_output(["git","config","--get","remote.origin.url"], text=True).strip()
    if url.endswith(".git"):
        url = url[:-4]
    if url.startswith("git@"):
        _, slug = url.split(":",1)
    else:
        parts = url.split("/")
        slug = "/".join(parts[-2:])
    return slug

def ensure_labels(slug: str, labels: Set[str], token: str) -> None:
    import requests
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    # fetch existing
    existing = {}
    page = 1
    while True:
        r = requests.get(f"https://api.github.com/repos/{slug}/labels?per_page=100&page={page}", headers=headers, timeout=30)
        r.raise_for_status()
        data = r.json()
        if not data: break
        for lab in data:
            existing[lab["name"]] = lab
        page += 1
    # create missing (pick deterministic colors)
    for name in sorted(labels):
        if name in existing:
            continue
       # simple color map
        color = "0e8a16" if name.startswith("priority:") else "0366d6"
        payload = {"name": name, "color": color, "description": "auto-created from tasks.md"}
        r = requests.post(f"https://api.github.com/repos/{slug}/labels", headers=headers, json=payload, timeout=30)
        # ignore 422 (already exists race)
        if r.status_code not in (200,201,422):
            r.raise_for_status()

def add_labels_to_pr(slug: str, pr_number: int, labels: Set[str], token: str) -> None:
    import requests
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    if not labels:
        return
    ensure_labels(slug, labels, token)
    r = requests.post(
        f"https://api.github.com/repos/{slug}/issues/{pr_number}/labels",
        headers=headers,
        json={"labels": sorted(labels)},
        timeout=30,
    )
    # 200 OK returns current labels; 201 Created also valid
    if r.status_code not in (200,201):
        r.raise_for_status()

def main():
    event_path = os.getenv("GITHUB_EVENT_PATH")
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    if not (event_path and token):
        print("Missing GITHUB_EVENT_PATH or token", file=sys.stderr); sys.exit(2)
    evt = json.load(open(event_path, "r", encoding="utf-8"))
    pr = evt.get("pull_request") or {}
    pr_number = int(pr.get("number"))
    title = pr.get("title") or ""
    body = pr.get("body") or ""
    branch = (pr.get("head") or {}).get("ref","")

    # find FK IDs
    ids: Set[str] = set()
    for blob in (title, body, branch):
        ids.update(t.upper() for t in TASK_ID_RE.findall(blob or ""))

    tasks_path = "tasks.md"
    if not os.path.exists(tasks_path):
        print("tasks.md not found; nothing to label")
        return
    tasks = parse_tasks_md(tasks_path)

    labels: Set[str] = set()
    for tid in sorted(ids):
        t = tasks.get(tid)
        if not t:
            continue
        # task labels
        for l in (t["labels"] or []):
            labels.add(str(l))
        # priority from title
        m = PRIORITY_PAT.search(t["title"] or "")
        if m:
            labels.add(f"priority:{m.group(1).upper()}")

    # If no labels found but FK present, at least tag with "from:tasks"
    if ids and not labels:
        labels.add("from:tasks")

    slug = repo_slug_from_git()
    add_labels_to_pr(slug, pr_number, labels, token)
    print(f"Applied labels to PR #{pr_number}: {sorted(labels)}")

if __name__ == "__main__":
    main()
