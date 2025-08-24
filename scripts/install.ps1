#!/usr/bin/env pwsh
<#
Usage: install.ps1 [-Defaults | -Yes] [-Help]
    -Defaults, -Yes  Use default answers for all prompts
    -Help            Show this help message and exit
#>
Set-StrictMode -Version Latest

[CmdletBinding()]
param(
    [switch]$Defaults,
    [switch]$Yes,
    [switch]$Help
)

if ($Help) {
    Write-Host 'Usage: install.ps1 [-Defaults | -Yes] [-Help]'
    Write-Host ''
    Write-Host 'Options:'
    Write-Host '  -Defaults, -Yes  Use default answers for all prompts'
    Write-Host '  -Help            Show this help message and exit'
    exit
}

$useDefaults = $Defaults.IsPresent -or $Yes.IsPresent

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
$envFile = Join-Path $rootDir '.env'

if ($useDefaults) {
    $choice = '1'
    Write-Host 'Using default setup type: Local single-user'
} else {
    Write-Host 'Select setup type:'
    Write-Host '[1] Local single-user'
    Write-Host '[2] Multi-agent distributed (Docker)'
    $choice = ''
    while ($true) {
        $choice = Read-Host 'Enter choice [1-2]'
        switch ($choice) {
            '1' { break }
            '2' { break }
            default { Write-Host 'Invalid choice. Please enter 1 or 2.' }
        }
    }
}

if ($useDefaults) {
    $modelDir = './models'
    Write-Host "Using default model storage directory: $modelDir"
} else {
    $modelDir = Read-Host 'Model storage directory [./models]'
    if ([string]::IsNullOrWhiteSpace($modelDir)) { $modelDir = './models' }
}
$env:MODEL_DIR = $modelDir

if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $rootDir '.env.example') $envFile }

$content = @()
if (Test-Path $envFile) {
    $content = Get-Content $envFile | Where-Object {$_ -notmatch '^MODEL_DIR='}
}
$content += "MODEL_DIR=$modelDir"
Set-Content -Path $envFile -Value $content

if ($useDefaults) {
    $install = 'n'
} else {
    $install = Read-Host 'Install Node dependencies and launch services? [y/N]'
}

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
