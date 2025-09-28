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
$args += 'up','-d'
if ($Build) { $args += '--build' }

Write-Host "Bringing up stack via: docker compose $($args -join ' ')"
& docker compose @args | Out-Null

if ($IncludeMongo) {
  # Ensure mongo is up (service name mongodb); suppress errors if undefined
  $null = (& docker compose -f $ComposeFile up -d mongodb 2>$null) ; $code = $LASTEXITCODE
  if ($code -ne 0) { Write-Host "(mongo not present in compose; skipping)" }
}

Write-Host "✅ Stack ensure complete."
exit 0
