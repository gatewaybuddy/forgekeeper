#!/usr/bin/env pwsh
param()

Write-Host "==> FORGEKEEPER DOCTOR (Windows) v2 stabilization"

function Test-Cmd($name) {
  try { Get-Command $name -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

$pkgRoot = Split-Path -Parent $PSScriptRoot  # points to forgekeeper/
Write-Host ("Package root: {0}" -f $pkgRoot)

if (Test-Cmd python) { Write-Host ("[OK]    python: {0}" -f (python --version)) } else { Write-Host "[WARN]  python not found" }
if (Test-Cmd pip)    { Write-Host ("[OK]    pip: {0}" -f (pip --version)) } else { Write-Host "[WARN]  pip not found" }
if (Test-Cmd node)   { Write-Host ("[OK]    node: {0}" -f (node -v)) } else { Write-Host "[WARN]  node not found" }
if (Test-Cmd npm)    { Write-Host ("[OK]    npm: {0}" -f (npm -v)) } else { Write-Host "[WARN]  npm not found" }
if (Test-Cmd docker) { Write-Host ("[OK]    docker: {0}" -f (docker --version)) } else { Write-Host "[WARN]  docker not found" }
if (Test-Cmd git)    { Write-Host ("[OK]    git: {0}" -f (git --version)) } else { Write-Host "[WARN]  git not found" }

if (Test-Cmd nvidia-smi) {
  Write-Host ("[OK]    nvidia-smi: {0}" -f ((nvidia-smi --query-gpu=name,memory.total --format=csv,noheader) 2>$null))
} else {
  Write-Host "[WARN]  nvidia-smi not found (GPU optional)"
}

if (Test-Path (Join-Path $pkgRoot 'frontend')) { Write-Host "[OK]    frontend/ present" } else { Write-Host "[WARN]  frontend/ missing" }
if (Test-Path (Join-Path $pkgRoot 'backend'))  { Write-Host "[OK]    backend/ present" } else { Write-Host "[WARN]  backend/ missing" }
if (Test-Path (Join-Path $pkgRoot 'forgekeeper')) { Write-Host "[OK]    forgekeeper package present" } else { Write-Host "[ERROR] forgekeeper/ missing" }
if ((Test-Path (Join-Path $pkgRoot 'tests')) -or (Test-Path (Join-Path $pkgRoot 'forgekeeper/tests'))) { Write-Host "[OK]    tests/ present" } else { Write-Host "[WARN]  tests/ missing" }

$envEx = Join-Path $pkgRoot '.env.example'
if (Test-Path $envEx) {
  $envText = Get-Content -Raw -Path $envEx
  if ($envText -match 'FGK_INFERENCE_BACKEND=' -and $envText -match 'FGK_USE_GATEWAY=' -and $envText -match 'FGK_MEMORY_BACKEND=') {
    Write-Host "[OK]    .env.example contains FGK_* flags"
  } else {
    Write-Host "[WARN]  .env.example missing one or more FGK_* flags"
  }
} else {
  Write-Host "[WARN]  .env.example not found at package root"
}

$composePath = Join-Path $pkgRoot 'infra/docker/docker-compose.inference.yml'
if (Test-Path $composePath) { Write-Host "[OK]    found infra/docker/docker-compose.inference.yml" } else { Write-Host "[WARN]  inference docker-compose not found (ok for now)" }

Write-Host "==> Doctor checks complete"
exit 0

