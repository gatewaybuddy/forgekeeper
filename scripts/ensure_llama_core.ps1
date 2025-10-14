#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$ProjectDir,
  [string]$ComposeFile = 'docker-compose.yml',
  [string]$Container = 'forgekeeper-llama-core-1',
  [string]$Image,
  [switch]$AutoPull
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
if (-not $Image -or [string]::IsNullOrWhiteSpace($Image)) {
  $Image = if ($env:LLAMA_DOCKER_IMAGE) { $env:LLAMA_DOCKER_IMAGE } else { 'ghcr.io/ggerganov/llama.cpp:server' }
}

function Expected-Cmd() { @() }

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
  Write-Host "ℹ️ llama.cpp Core container not found. Starting via compose..."
  & docker compose -f $ComposeFile up -d llama-core
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  # verify container now exists
  $inspect = Get-ContainerJson $Container
  if ($null -eq $inspect) {
    Write-Error "llama-core container not created; please verify LLAMA_DOCKER_IMAGE and model path."
    exit 2
  }
  exit 0
}

$running = [bool]$inspect[0].State.Running
$cmd = @()
if ($inspect[0].Config -and $inspect[0].Config.Cmd) { $cmd = @($inspect[0].Config.Cmd) }
$imgInContainer = $inspect[0].Config.Image
$imgIdDesired = if ($Image) { Get-ImageId $Image } else { $null }

function Same-Cmd($a, $b) {
  if ($a.Count -ne $b.Count) { return $false }
  for ($i=0; $i -lt $a.Count; $i++) { if ("$a[$i]" -ne "$b[$i]") { return $false } }
  return $true
}

$needRecreate = $false
if ($imgIdDesired -and $imgInContainer -and $imgInContainer -ne $Image) {
  $imgIdInContainer = Get-ImageId $imgInContainer
  if ($imgIdInContainer -and $imgIdDesired -ne $imgIdInContainer) { $needRecreate = $true }
}
if (-not (Same-Cmd $cmd $exp)) { $needRecreate = $true }

if ($needRecreate -or ($imgInContainer -and ($imgInContainer -notmatch 'localai'))) {
  Write-Host "♻️ llama.cpp Core config changed. Recreating via compose..."
  # Remove old container to ensure config reset (e.g., runtime/gpu flags)
  try { & docker compose -f $ComposeFile rm -sf llama-core | Out-Null } catch {}
  & docker compose -f $ComposeFile up -d llama-core
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $inspect = Get-ContainerJson $Container
  if ($null -eq $inspect) {
    Write-Error "llama-core container not created after recreate; check image tag and logs."
    exit 2
  }
  exit 0
}

if (-not $running) {
  Write-Host "▶️ Starting existing llama.cpp Core container..."
  docker start $Container | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  exit 0
}

Write-Host "✅ llama.cpp Core already running with matching config."
exit 0
