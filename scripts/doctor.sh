#!/usr/bin/env bash
set -euo pipefail

echo "==> FORGEKEEPER DOCTOR (v2 stabilization)"

ok() { echo "[OK]    $1"; }
warn() { echo "[WARN]  $1"; }
err() { echo "[ERROR] $1"; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)

echo "Repo root: $ROOT_DIR"

# 1) Core toolchain checks
if has_cmd python3; then PY=python3; ok "python3 found: $($PY --version 2>&1)";
elif has_cmd python; then PY=python; ok "python found: $($PY --version 2>&1)";
else err "python not found"; fi

if has_cmd pip; then ok "pip found: $(pip --version 2>&1)"; else warn "pip not found"; fi
if has_cmd node; then ok "node found: $(node -v)"; else warn "node not found"; fi
if has_cmd npm; then ok "npm found: $(npm -v)"; else warn "npm not found"; fi
if has_cmd docker; then ok "docker found: $(docker --version 2>&1)"; else warn "docker not found"; fi
if has_cmd git; then ok "git found: $(git --version 2>&1)"; else warn "git not found"; fi

# 2) GPU / CUDA (optional)
if has_cmd nvidia-smi; then ok "nvidia-smi OK: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -n1)"; else warn "nvidia-smi not found (GPU optional)"; fi

# 3) Structure checks
[[ -d "$ROOT_DIR/frontend" ]] && ok "frontend/ present" || warn "frontend/ missing"
[[ -d "$ROOT_DIR/backend" ]] && ok "backend/ present" || warn "backend/ missing"
[[ -d "$ROOT_DIR/forgekeeper" ]] && ok "forgekeeper package present" || err "forgekeeper/ missing"
[[ -d "$ROOT_DIR/tests" || -d "$ROOT_DIR/forgekeeper/tests" ]] && ok "tests/ present" || warn "tests/ missing"

# 4) Env flags present in .env.example
ENV_EX="$ROOT_DIR/.env.example"
if [[ -f "$ENV_EX" ]]; then
  if grep -q "FGK_INFERENCE_BACKEND=" "$ENV_EX" && \
     grep -q "FGK_USE_GATEWAY=" "$ENV_EX" && \
     grep -q "FGK_MEMORY_BACKEND=" "$ENV_EX"; then
     ok ".env.example contains FGK_* flags"
  else
     warn ".env.example missing one or more FGK_* flags"
  fi
else
  warn ".env.example not found at repo root"
fi

# 5) Inference infra (skippable)
if [[ -f "$ROOT_DIR/infra/docker/docker-compose.inference.yml" ]]; then
  ok "found infra/docker/docker-compose.inference.yml"
else
  warn "inference docker-compose not found (ok for now)"
fi

echo "==> Doctor checks complete"
exit 0

