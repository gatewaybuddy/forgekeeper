#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Definition | Split-Path -Parent
$flag = Join-Path $rootDir '.forgekeeper' 'restart.flag'

Write-Host "Watching $flag for restart requests (Ctrl+C to stop)"
while ($true) {
  if (Test-Path $flag) {
    Write-Host "Restart flag detected. Restarting services..."
    Remove-Item -ErrorAction SilentlyContinue $flag
    & (Join-Path $rootDir 'start.ps1')
  }
  Start-Sleep -Seconds 5
}

