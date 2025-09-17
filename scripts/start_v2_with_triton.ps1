#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$ModelRepo = 'openai/gpt-oss-20b',
  [int]$WaitSeconds = 600,
  [switch]$NoDownload,
  [switch]$Detach,
  [string]$LogDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info([string]$m) { Write-Host "[v2+triton] $m" }
function Write-Warn([string]$m) { Write-Warning $m }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir   = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the TritonLLM gateway."
}

$composePath = (Resolve-Path (Join-Path $rootDir '../forgekeeper-v2/docker-compose.tritonllm.yml') -ErrorAction SilentlyContinue)
if (-not $composePath) { $composePath = (Resolve-Path (Join-Path $rootDir 'forgekeeper-v2/docker-compose.tritonllm.yml')) }

$modelDir = (Resolve-Path (Join-Path $rootDir '../forgekeeper-v2/models') -ErrorAction SilentlyContinue)
if (-not $modelDir) { $modelDir = (Resolve-Path (Join-Path $rootDir 'forgekeeper-v2/models')) }
if (-not (Test-Path $modelDir)) { New-Item -ItemType Directory -Path $modelDir | Out-Null }

# Ensure model exists
$target = Join-Path $modelDir 'gpt-oss-20b'
if (-not (Test-Path (Join-Path $target 'config.json'))) {
  if ($NoDownload) {
    Write-Warn "Model not found at $target; skipping download due to -NoDownload."
  } else {
    Write-Info "Downloading model: $ModelRepo -> $target"
    & python 'forgekeeper/scripts/download_hf_model.py' $ModelRepo $target
  }
}

# Compose env
$env:HOST_MODEL_DIR = $modelDir
$env:CHECKPOINT     = '/models/gpt-oss-20b/original'

Write-Info "Starting TritonLLM gateway ..."
docker compose -f $composePath up -d --build | Out-Null

# Wait for gateway
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$ready = $false
$gwUrl = 'http://127.0.0.1:8008/openapi.json'
while ((Get-Date) -lt $deadline) {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $gwUrl; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}
  Start-Sleep -Seconds 5
}
if (-not $ready) { throw "Gateway did not become ready at $gwUrl within $WaitSeconds seconds." }
Write-Info "Gateway READY at $gwUrl"

# Prepare logs dir
if (-not $LogDir) {
  $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
  $LogDir = Join-Path $rootDir (Join-Path 'logs' ("start-v2-triton-" + $ts))
}
New-Item -Force -ItemType Directory -Path $LogDir | Out-Null

$env:TRITONLLM_URL = 'http://127.0.0.1:8008'

# Always run via python -m forgekeeper to prefer local mono-repo sources
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'python not found on PATH.' }
$runner = 'python'
$argsServer = @('-m','forgekeeper','server')
$argsRun    = @('-m','forgekeeper','run','--llm','triton','--duration','0')

Write-Info "Starting UI server (port 8787) ..."
$uiOut = Join-Path $LogDir 'ui.out.log'
$uiErr = Join-Path $LogDir 'ui.err.log'
$uiProc = Start-Process -FilePath $runner -ArgumentList $argsServer -WorkingDirectory $rootDir -RedirectStandardOutput $uiOut -RedirectStandardError $uiErr -WindowStyle Minimized -PassThru

Write-Info "Starting orchestrator loop ..."
$runOut = Join-Path $LogDir 'run.out.log'
$runErr = Join-Path $LogDir 'run.err.log'
$orchProc = Start-Process -FilePath $runner -ArgumentList $argsRun -WorkingDirectory $rootDir -RedirectStandardOutput $runOut -RedirectStandardError $runErr -WindowStyle Minimized -PassThru

$meta = [ordered]@{
  uiPid    = $uiProc.Id
  orchPid  = $orchProc.Id
  logDir   = $LogDir
  gwUrl    = $env:TRITONLLM_URL
  uiUrl    = 'http://127.0.0.1:8787'
  startedAt= (Get-Date).ToString('o')
}
($meta | ConvertTo-Json -Depth 4) | Set-Content (Join-Path $LogDir 'pids.json')

Write-Info ("Running. UI: {0}  Gateway: {1}" -f $meta.uiUrl, $meta.gwUrl)
Write-Info ("Logs: {0}" -f $LogDir)
Write-Info ("Stop: Stop-Process -Id {0},{1} ; docker compose -f `"{2}`" down" -f $uiProc.Id, $orchProc.Id, $composePath)

if ($Detach) {
  exit 0
}

try {
  Wait-Process -Id $uiProc.Id,$orchProc.Id
} finally {
  Write-Info 'Stopping child processes ...'
  foreach ($p in @($uiProc,$orchProc)) { try { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } } catch {} }
}
