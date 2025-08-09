import os, re, subprocess, sys, textwrap

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from tools.roadmap_sync import parse_tasks_md  # reuse

PRIORITY_PAT = re.compile(r"\((P\d)\)")


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def pick_next(tasks):
    todo = [t for t in tasks if t.status == "todo"]

    def pri_value(t):
        m = PRIORITY_PAT.search(t.title or "")
        return int(m.group(1)[1]) if m else 2

    return sorted(todo, key=lambda t: pri_value(t))[0] if todo else None


def run(*args, **kw):
    return subprocess.check_output(list(args), text=True, **kw).strip()


def main():
    gh_token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN")
    if not gh_token:
        print("GH_TOKEN required", file=sys.stderr)
        sys.exit(2)
    tasks = parse_tasks_md("tasks.md")
    t = pick_next(tasks)
    if not t:
        print("No todo tasks")
        return
    branch = f"fk/{t.id.lower()}-{slugify(t.title)[:40]}"
    # create branch
    run("git", "checkout", "-b", branch)
    run("git", "push", "-u", "origin", branch)
    # pick template by labels
    labels = set((t.labels or []))
    if "bug" in labels or "bugfix" in labels:
        template = ".github/PULL_REQUEST_TEMPLATE/bugfix.md"
        title_prefix = "fix"
    elif "refactor" in labels:
        template = ".github/PULL_REQUEST_TEMPLATE/refactor.md"
        title_prefix = "refactor"
    elif "docs" in labels:
        template = ".github/PULL_REQUEST_TEMPLATE/docs.md"
        title_prefix = "docs"
    elif "infra" in labels or "chore" in labels:
        template = ".github/PULL_REQUEST_TEMPLATE/infra-chore.md"
        title_prefix = "chore"
    else:
        template = ".github/PULL_REQUEST_TEMPLATE/feature.md"
        title_prefix = "feat"
    body = open(template, "r", encoding="utf-8").read()
    title = f"{title_prefix}: {t.title} [{t.id}]"
    import requests
    # discover repo
    remote = run("git", "config", "--get", "remote.origin.url")
    if remote.endswith(".git"):
        remote = remote[:-4]
    if remote.startswith("git@"):
        _, slug = remote.split(":", 1)
    else:
        slug = "/".join(remote.split("/")[-2:])
    url = f"https://api.github.com/repos/{slug}/pulls"
    headers = {
        "Authorization": f"Bearer {gh_token}",
        "Accept": "application/vnd.github+json",
    }
    data = {
        "title": title,
        "head": branch,
        "base": "main",
        "body": body,
        "draft": True,
    }
    r = requests.post(url, headers=headers, json=data, timeout=30)
    r.raise_for_status()
    pr = r.json()
    print(f"PR drafted: #{pr['number']} {pr['html_url']}")


if __name__ == "__main__":
    main()

