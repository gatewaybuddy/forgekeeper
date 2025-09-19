#!/usr/bin/env pwsh
param(
  [string]$Url = 'http://localhost:4000/health',
  [int]$MaxWait = 30
)

$python = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $python) { Write-Host "ERROR: python not found"; exit 2 }

& $python.Path "$(Join-Path $PSScriptRoot 'wait_for_url.py')" $Url --max-wait $MaxWait
exit $LASTEXITCODE

