#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$BaseUrl,
  [int]$WaitSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $BaseUrl -or [string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = if ($env:FK_CORE_API_BASE) { $env:FK_CORE_API_BASE } else { 'http://localhost:8001' }
}

$u1 = ($BaseUrl.TrimEnd('/')) + '/healthz'
$u2 = ($BaseUrl.TrimEnd('/')) + '/health'

Write-Host "Checking vLLM health at $u1 and $u2 (timeout ${WaitSeconds}s)"
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$ok = $false
do {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $u1; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $u2; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}
  Start-Sleep -Seconds 2
} while (-not $ok -and (Get-Date) -lt $deadline)

if ($ok) { Write-Host "OK"; exit 0 } else { Write-Error "vLLM not healthy at $BaseUrl"; exit 1 }

