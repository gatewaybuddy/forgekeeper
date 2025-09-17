from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: python download_hf_model.py <repo_id> <dest_dir>")
        raise SystemExit(2)
    repo_id = sys.argv[1]
    dest = Path(sys.argv[2])
    try:
        from huggingface_hub import snapshot_download
    except Exception:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "huggingface_hub"])  # noqa: S603, S607
        from huggingface_hub import snapshot_download  # type: ignore
    dest.mkdir(parents=True, exist_ok=True)
    path = snapshot_download(repo_id=repo_id, local_dir=str(dest), local_dir_use_symlinks=False, resume_download=True)
    print(Path(path).resolve())


if __name__ == "__main__":
    main()

