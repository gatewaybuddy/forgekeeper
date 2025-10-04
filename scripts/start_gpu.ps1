#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 600,
  [switch]$ForceCPU
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Load-DotEnv([string]$path) {
  if (-not (Test-Path $path)) { return @{} }
  $envs = @{}
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    if ($line -match '^(?<k>[A-Za-z_][A-Za-z0-9_]*)=(?<v>.*)$') {
      $k = $Matches['k']; $v = $Matches['v']
      if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
      $envs[$k] = $v
    }
  }
  return $envs
}

function Test-Command([string]$name) {
  try { Get-Command $name -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

function Test-DockerGPU() {
  try {
    # Quick heuristic: if Docker lists the 'nvidia' runtime AND host has nvidia-smi, assume GPU-capable.
    $info = ''
    try { $info = (docker info 2>$null | Out-String) } catch {}
    $hasNvruntime = ($info -match 'Runtimes:.*nvidia')
    $hasHostSmi = $false
    try { Get-Command nvidia-smi -ErrorAction Stop | Out-Null; $hasHostSmi = $true } catch {}
    if ($hasNvruntime -and $hasHostSmi) { return $true }

    # Validate by running nvidia-smi in a minimal CUDA base image. Try a few modern tags.
    $candidateTags = @(
      '12.6.0-base-ubuntu22.04',
      '12.5.1-base-ubuntu22.04',
      '12.4.1-base-ubuntu22.04',
      '12.6.0-base-ubuntu20.04',
      '12.5.1-base-ubuntu20.04',
      '12.4.1-base-ubuntu20.04'
    )
    foreach ($tag in $candidateTags) {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = (Get-Command docker).Source
      $psi.ArgumentList = @('run','--rm','--gpus','all',"nvidia/cuda:$tag",'nvidia-smi')
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      $psi.UseShellExecute = $false
      $p = [System.Diagnostics.Process]::Start($psi)
      $ok = $p.WaitForExit(90*1000)
      if (-not $ok) { try { $p.Kill() } catch {} ; continue }
      if ($p.ExitCode -eq 0) { return $true }
    }
    return $false
  } catch { return $false }
}

function Wait-CoreHealthy([string]$base, [int]$timeoutSec, [string]$containerName) {
  Write-Host "⏳ Waiting for core health (up to $timeoutSec s) at $base ..."
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $urls = @(
    ($base.TrimEnd('/') + '/v1/models'),
    ($base.TrimEnd('/') + '/healthz'),
    ($base.TrimEnd('/') + '/health')
  )
  $lastLog = (Get-Date).AddSeconds(-99)
  do {
    foreach ($u in $urls) {
      try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $u
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
          Write-Host "✅ Core healthy: $u ($($r.StatusCode))"
          return $true
        }
      } catch {}
    }
    $now = Get-Date
    if (($now - $lastLog).TotalSeconds -ge 10) {
      try { $snippet = docker logs --tail 12 $containerName 2>$null | Out-String ; if ($snippet) { Write-Host "--- recent core logs ---`n$snippet`n------------------------" } } catch {}
      $lastLog = $now
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)
  Write-Warning "Core health did not become ready within $timeoutSec s."
  return $false
}

# Resolve project dir and compose location
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = (Split-Path -Parent $scriptDir)
Set-Location $projectDir

$dotenv = Load-DotEnv (Join-Path $projectDir '.env')
$portHost = if ($dotenv.ContainsKey('LLAMA_PORT_CORE')) { [int]$dotenv['LLAMA_PORT_CORE'] } else { 8001 }
$portContainer = if ($dotenv.ContainsKey('LLAMA_CONTAINER_PORT')) { [int]$dotenv['LLAMA_CONTAINER_PORT'] } else { 8080 }
$modelPath = if ($dotenv.ContainsKey('LLAMA_MODEL_CORE')) { $dotenv['LLAMA_MODEL_CORE'] } else { '/models/model.gguf' }

if (-not (Test-Command docker)) { Write-Error 'Docker is not installed or not in PATH.'; exit 2 }
if (-not (Test-Command python)) { Write-Warning 'python not found in PATH; trying py'; if (Test-Command py) { $global:PY = 'py' } else { $global:PY = 'python' } } else { $global:PY = 'python' }

$gpuReady = $false
if (-not $ForceCPU) {
  $gpuReady = Test-DockerGPU
}
if ($gpuReady) {
  $env:FK_CORE_GPU = '1'
  Write-Host 'GPU detected for Docker; using GPU core (llama.cpp server-cublas).'
  # Pull GPU image if set
  $gpuImg = if ($dotenv.ContainsKey('LLAMA_DOCKER_GPU_IMAGE')) { $dotenv['LLAMA_DOCKER_GPU_IMAGE'] } else { 'ghcr.io/ggml-org/llama.cpp:server-cublas' }
  try { docker pull $gpuImg | Out-Null } catch {}
} else {
  $env:FK_CORE_GPU = '0'
  Write-Warning 'GPU not detected or not ready; falling back to CPU core (LocalAI).'
  $cpuImg = if ($dotenv.ContainsKey('LOCALAI_DOCKER_IMAGE')) { $dotenv['LOCALAI_DOCKER_IMAGE'] } else { 'localai/localai:latest' }
  try { docker pull $cpuImg | Out-Null } catch {}
}

# Bring up stack (background)
Write-Host 'Ensuring stack (UI + core)...'
$args = @('ensure-stack')
if ($gpuReady) { $args += @('--profile','inference') } else { $args += @('--profile','inference-cpu') }
$args += @('--profile','ui')
& $PY -m forgekeeper @args
$rc = $LASTEXITCODE
if ($rc -ne 0) { Write-Error "ensure-stack failed with exit code $rc"; exit $rc }

# Determine container name and base URL
$container = if ($gpuReady) { 'forgekeeper-llama-core-1' } else { 'forgekeeper-llama-core-cpu-1' }
$base = "http://localhost:$portHost"

# Wait for health up to TimeoutSeconds
$ok = Wait-CoreHealthy -base $base -timeoutSec $TimeoutSeconds -containerName $container
if (-not $ok) {
  Write-Host 'Containers:'
  try { docker compose -f (Join-Path $projectDir 'docker-compose.yml') ps } catch {}
  Write-Host 'Core logs (last 60 lines):'
  try { docker logs --tail 60 $container } catch {}
  exit 1
}

# Tail core logs briefly for any obvious issues
Write-Host 'Tailing core logs for 60 seconds (Ctrl+C to stop earlier)...'
try {
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    docker logs --tail 10 $container 2>$null | Out-String | ForEach-Object { if ($_ -and $_.Trim()) { Write-Host $_ } }
    Start-Sleep -Seconds 3
  }
} catch {}

Write-Host '✅ Core and UI started. Visit:'
Write-Host " - UI: http://localhost:$($dotenv['FRONTEND_PORT'] ?? '5173')"
Write-Host " - Core API: $base/v1"
exit 0
