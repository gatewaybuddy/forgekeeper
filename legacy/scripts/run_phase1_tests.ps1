#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$BaseUrl = 'http://localhost:8001',
  [int]$WaitSeconds = 600,
  [string]$Model = 'core'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "== Phase 1: Health =="
& "$PSScriptRoot/test_vllm_health.ps1" -BaseUrl $BaseUrl -WaitSeconds $WaitSeconds
if ($LASTEXITCODE -ne 0) { Write-Error "Health check failed"; exit 1 }

Write-Host "== Phase 1: Harmony basic =="
& "$PSScriptRoot/test_harmony_basic.ps1" -BaseUrl $BaseUrl -Model $Model
if ($LASTEXITCODE -ne 0) { Write-Error "Harmony test failed"; exit 1 }

Write-Host "✅ Phase 1 tests passed"
exit 0

