#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$ModelRepo = 'openai/gpt-oss-20b',
  [int]$WaitSeconds = 600,
  [switch]$NoDownload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir   = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the TritonLLM gateway."
}

$composePath = (Resolve-Path (Join-Path $rootDir '../forgekeeper-v2/docker-compose.tritonllm.yml')).Path
if (-not (Test-Path $composePath)) { $composePath = (Resolve-Path (Join-Path $rootDir 'forgekeeper-v2/docker-compose.tritonllm.yml')).Path }

$modelDir = (Resolve-Path (Join-Path $rootDir '../forgekeeper-v2/models') -ErrorAction SilentlyContinue)
if (-not $modelDir) { $modelDir = (Resolve-Path (Join-Path $rootDir 'forgekeeper-v2/models')) }
if (-not (Test-Path $modelDir)) { New-Item -ItemType Directory -Path $modelDir | Out-Null }

$target = Join-Path $modelDir 'gpt-oss-20b'
if (-not (Test-Path (Join-Path $target 'config.json'))) {
  if ($NoDownload) {
    Write-Warning "Model not found at $target; skipping download due to -NoDownload."
  } else {
    Write-Host "Downloading model: $ModelRepo -> $target"
    & python 'forgekeeper/scripts/download_hf_model.py' $ModelRepo $target
  }
}

$env:HOST_MODEL_DIR = $modelDir
$env:CHECKPOINT     = '/models/gpt-oss-20b/original'

Write-Host "Starting TritonLLM gateway compose ..."
docker compose -f $composePath up -d --build | Out-Null

# Wait for readiness
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$ready = $false
$url = 'http://127.0.0.1:8008/openapi.json'
while ((Get-Date) -lt $deadline) {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $url; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}
  Start-Sleep -Seconds 5
}
if (-not $ready) { throw "Gateway did not become ready at $url within $WaitSeconds seconds." }

Write-Host "Gateway READY at $url"

# Smoke request
$respUrl = 'http://127.0.0.1:8008/v1/responses'
$payload = '{"model":"oss-20b","input":[{"role":"user","content":[{"type":"text","text":"Say hi"}]}],"max_output_tokens":8}'
$resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri $respUrl -Method Post -ContentType 'application/json' -Body $payload
Write-Host "Smoke response (truncated):" ($resp.Content.Substring(0, [Math]::Min(160, $resp.Content.Length)))

# Run forgekeeper v2 demo against the gateway
$env:TRITONLLM_URL = 'http://127.0.0.1:8008'
try {
  if (Get-Command forgekeeper -ErrorAction SilentlyContinue) {
    forgekeeper demo --llm triton --duration 8
  } else {
    python -m forgekeeper demo --llm triton --duration 8
  }
} catch {
  Write-Warning "forgekeeper demo failed: $($_.Exception.Message)"
}

Write-Host "Smoke test complete."

