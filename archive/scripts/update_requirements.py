#!/usr/bin/env python3
"""Lock top-level dependencies in requirements.txt to exact versions.

The script reads package names from ``requirements.txt`` and writes them
back with the versions currently installed in the environment.  Use this
after upgrading packages to refresh the pinned versions.
"""

from __future__ import annotations

import importlib.metadata as metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ_FILE = ROOT / "requirements.txt"


def main() -> None:
    # Collect package names without version specifiers.
    packages: list[str] = []
    for line in REQ_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name = line.split("==")[0].strip()
        packages.append(name)

    packages = sorted(set(packages), key=str.lower)

    with REQ_FILE.open("w", encoding="utf-8") as fh:
        for name in packages:
            try:
                version = metadata.version(name)
            except metadata.PackageNotFoundError as exc:  # pragma: no cover - runtime check
                raise SystemExit(f"Package '{name}' is not installed") from exc
            fh.write(f"{name}=={version}\n")


if __name__ == "__main__":  # pragma: no cover - manual invocation
    main()
