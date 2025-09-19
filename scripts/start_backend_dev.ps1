#!/usr/bin/env pwsh
param(
  [string]$DatabaseUrl = 'mongodb://localhost:27017/forgekeeper',
  [switch]$Minimized
)

$wd = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'backend'
$env:DATABASE_URL = $DatabaseUrl
$ws = if ($Minimized) { 'Minimized' } else { 'Normal' }
Start-Process -FilePath npm -ArgumentList @('run','dev') -WorkingDirectory $wd -WindowStyle $ws | Out-Null
Write-Host "BACKEND_DEV_STARTED"
exit 0
