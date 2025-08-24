#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
$envFile = Join-Path $rootDir '.env'

Write-Host 'Select setup type:'
Write-Host '[1] Local single-user'
Write-Host '[2] Multi-agent distributed (Docker)'
$choice = Read-Host 'Enter choice [1-2]'

$modelDir = Read-Host 'Model storage directory [./models]'
if ([string]::IsNullOrWhiteSpace($modelDir)) { $modelDir = './models' }
$env:MODEL_DIR = $modelDir

if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $rootDir '.env.example') $envFile }

$content = @()
if (Test-Path $envFile) {
    $content = Get-Content $envFile | Where-Object {$_ -notmatch '^MODEL_DIR='}
}
$content += "MODEL_DIR=$modelDir"
Set-Content -Path $envFile -Value $content

$install = Read-Host 'Install Node dependencies and launch services? [y/N]'
if ($install -match '^[Yy]') {
    if ($choice -eq '2') {
        & (Join-Path $scriptDir 'setup_docker_env.ps1') -Defaults
        $content = @()
        if (Test-Path $envFile) {
            $content = Get-Content $envFile | Where-Object {$_ -notmatch '^MODEL_DIR='}
        }
        $content += "MODEL_DIR=$modelDir"
        Set-Content -Path $envFile -Value $content
    } else {
        & (Join-Path $scriptDir 'setup_dev_env.ps1')
    }
} else {
    Write-Host 'Skipping dependency installation and service launch.'
}
