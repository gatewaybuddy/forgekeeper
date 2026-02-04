#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$ProjectDir,
  [string]$ComposeFile = 'docker-compose.yml',
  [switch]$Build,
  [string[]]$Profiles = @('ui','inference'),
  [switch]$IncludeMongo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ProjectDir) { $ProjectDir = (Split-Path -Parent $MyInvocation.MyCommand.Path) | Split-Path -Parent }
Set-Location $ProjectDir

# Normalize profiles if provided as a single comma-separated string
if ($Profiles -and $Profiles.Count -eq 1 -and ($Profiles[0] -match ',')) {
  $Profiles = $Profiles[0].Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
}

# Ensure network exists
try { & docker network inspect forgekeeper-net | Out-Null } catch { & docker network create forgekeeper-net | Out-Null }

$args = @('-f', $ComposeFile)
foreach ($p in $Profiles) { $args += @('--profile', $p) }

# Route frontend proxy based on FK_CORE_KIND (default: llama)
$core = if ($env:FK_CORE_KIND) { $env:FK_CORE_KIND.ToLower().Trim() } else { 'llama' }
$gpu  = if ($env:FK_CORE_GPU) { $env:FK_CORE_GPU.Trim() } else { '1' }
if ($core -eq 'vllm') {
  $env:FRONTEND_VLLM_API_BASE = 'http://vllm-core:8000/v1'
} else {
  $env:FRONTEND_VLLM_API_BASE = if ($gpu -eq '0') { 'http://llama-core-cpu:8080/v1' } else { 'http://llama-core:8080/v1' }
}

if ($Build) {
  Write-Host "Building selected services: frontend"
  & docker compose -f $ComposeFile build frontend
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "frontend image build failed. UI will be skipped; starting core services only."
    $Profiles = @($Profiles | Where-Object { $_ -ne 'ui' })
  }
}

# If image is missing locally, build it even when -Build not set
$frontendImage = 'forgekeeper-frontend'
try { $null = docker image inspect $frontendImage 2>$null } catch { $null = $null }
if ($LASTEXITCODE -ne 0) {
  Write-Host "frontend image missing locally; building..."
  & docker compose -f $ComposeFile build frontend
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "frontend image build failed. UI will be skipped; starting core services only."
    $Profiles = @($Profiles | Where-Object { $_ -ne 'ui' })
  }
}

$upArgs = $args + @('up','-d')
Write-Host "Bringing up stack via: docker compose $($upArgs -join ' ')"
& docker compose @upArgs
if ($LASTEXITCODE -ne 0) {
  Write-Error "docker compose up failed. Please check the logs above and fix any build/runtime errors."
  exit $LASTEXITCODE
}

if ($IncludeMongo) {
  # Ensure mongo is up (service name mongodb); suppress errors if undefined
  $null = (& docker compose -f $ComposeFile up -d mongodb 2>$null) ; $code = $LASTEXITCODE
  if ($code -ne 0) { Write-Host "(mongo not present in compose; skipping)" }
}

Write-Host "✅ Stack ensure complete."
exit 0
