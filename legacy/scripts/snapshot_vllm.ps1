#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$Container = 'forgekeeper-vllm-core-1',
  [string]$Tag,
  [switch]$AlsoTagSafe
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Tag -or [string]::IsNullOrWhiteSpace($Tag)) {
  $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
  $Tag = "forgekeeper-vllm:safe-$ts"
}

Write-Host "Creating snapshot image from container '$Container' -> '$Tag'"
docker commit $Container $Tag | Out-Null
Write-Host "✅ Snapshot created: $Tag"

if ($AlsoTagSafe) {
  $safeTag = 'forgekeeper-vllm:safe'
  Write-Host "Tagging '$Tag' as '$safeTag'"
  docker tag $Tag $safeTag
  Write-Host "✅ Tagged as: $safeTag"
}

Write-Host "Listing vLLM images:"
docker images forgekeeper-vllm

