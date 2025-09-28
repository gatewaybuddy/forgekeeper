#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$ProjectDir,
  [string]$ComposeFile = 'docker-compose.yml',
  [string]$Container = 'forgekeeper-vllm-core-1',
  [string]$Image = 'forgekeeper-vllm:latest',
  [switch]$AutoBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ProjectDir) {
  $ProjectDir = (Split-Path -Parent $MyInvocation.MyCommand.Path) | Split-Path -Parent
}
Set-Location $ProjectDir

function Load-DotEnv([string]$path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    if (-not $_ -or $_.StartsWith('#')) { return }
    if ($_ -match '^(?<k>[A-Za-z_][A-Za-z0-9_]*)=(?<v>.*)$') {
      $k = $Matches['k']; $v = $Matches['v']
      if ($v -and $v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v -and $v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
      Set-Item -Path ("Env:" + $k) -Value $v
    }
  }
}

Load-DotEnv (Join-Path $ProjectDir '.env')

function Expected-Cmd() {
  $port = if ($env:VLLM_CONTAINER_PORT) { $env:VLLM_CONTAINER_PORT } else { '8000' }
  $model = if ($env:VLLM_MODEL_CORE) { $env:VLLM_MODEL_CORE } else { '/models/gpt-oss-20b' }
  $tp = if ($env:VLLM_TP) { $env:VLLM_TP } else { '1' }
  $maxlen = if ($env:VLLM_MAX_MODEL_LEN) { $env:VLLM_MAX_MODEL_LEN } else { '4096' }
  $util = if ($env:VLLM_GPU_MEMORY_UTILIZATION) { $env:VLLM_GPU_MEMORY_UTILIZATION } else { '0.9' }
  @('--host','0.0.0.0','--port',"$port",'--model',"$model",'--served-model-name','core','--tensor-parallel-size',"$tp",'--max-model-len',"$maxlen",'--gpu-memory-utilization',"$util")
}

function Get-ContainerJson([string]$name) {
  try { docker inspect $name | ConvertFrom-Json } catch { $null }
}

function Get-ImageId([string]$ref) {
  try { docker image inspect $ref -f '{{.Id}}' } catch { $null }
}

$exp = Expected-Cmd
$null = (docker network inspect forgekeeper-net 2>$null) ; if ($LASTEXITCODE -ne 0) { docker network create forgekeeper-net | Out-Null }

$inspect = Get-ContainerJson $Container
if ($null -eq $inspect) {
  Write-Host "ℹ️ vLLM Core container not found. Starting via compose..."
  & docker compose -f $ComposeFile up -d --build vllm-core | Out-Null
  exit 0
}

$running = [bool]$inspect[0].State.Running
$cmd = @()
if ($inspect[0].Config -and $inspect[0].Config.Cmd) { $cmd = @($inspect[0].Config.Cmd) }
$imgInContainer = $inspect[0].Config.Image
$imgIdDesired = Get-ImageId $Image

function Same-Cmd($a, $b) {
  if ($a.Count -ne $b.Count) { return $false }
  for ($i=0; $i -lt $a.Count; $i++) { if ("$a[$i]" -ne "$b[$i]") { return $false } }
  return $true
}

$needRecreate = $false
if ($imgIdDesired -and $imgInContainer -and $imgInContainer -ne $Image) {
  # If container stores the tag name, compare IDs for certainty
  $imgIdInContainer = Get-ImageId $imgInContainer
  if ($imgIdInContainer -and $imgIdDesired -ne $imgIdInContainer) { $needRecreate = $true }
}
if (-not (Same-Cmd $cmd $exp)) { $needRecreate = $true }

if ($needRecreate) {
  Write-Host "♻️ vLLM Core config changed. Recreating via compose..."
  $args = @('-f', $ComposeFile, 'up', '-d')
  if ($AutoBuild) { $args += '--build' }
  $args += 'vllm-core'
  & docker compose @args | Out-Null
  exit 0
}

if (-not $running) {
  Write-Host "▶️ Starting existing vLLM Core container..."
  docker start $Container | Out-Null
  exit 0
}

Write-Host "✅ vLLM Core already running with matching config."
exit 0
