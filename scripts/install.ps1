#!/usr/bin/env pwsh
<#!
Usage: pwsh scripts/install.ps1 [-h|--help] [--defaults|--yes|-Defaults]

Options:
  -h, --help              Display this help message and exit
  --defaults, --yes, -Defaults  Run non-interactively with default choices

#>
Set-StrictMode -Version Latest

[CmdletBinding()]
param(

    [Alias('h')][switch]$Help,
    [Alias('yes')][switch]$Defaults
)

function Show-Usage {
    Get-Content $MyInvocation.MyCommand.Path | Select-String '^Usage:' -Context 0,4 | ForEach-Object { $_.Context.PostContext + $_.Line }
}

if ($Help) {
    Show-Usage
    exit 0
}

$useDefaults = $Defaults


$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
$envFile = Join-Path $rootDir '.env'

if (-not (Get-Command mongod -ErrorAction SilentlyContinue)) {
    $startDockerMongo = ''
    if ($useDefaults) {
        $startDockerMongo = 'y'
    } else {
        $startDockerMongo = Read-Host 'mongod not found. Start Dockerized MongoDB container? [Y/n]'
    }
    if ($startDockerMongo -match '^([Yy]|)$') {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            Write-Error '❌ docker is required to run MongoDB container.'
            exit 1
        }
        $existing = docker ps -aq -f name=^forgekeeper-mongo$
        if ($existing) {
            $running = docker ps -q -f name=^forgekeeper-mongo$
            if ($running) {
                Write-Host "MongoDB container 'forgekeeper-mongo' already running."
            } else {
                docker start forgekeeper-mongo | Out-Null
                Write-Host "✅ Started existing MongoDB container 'forgekeeper-mongo'."
            }
        } else {
            docker run -d --name forgekeeper-mongo -p 27017:27017 mongo:6 | Out-Null
            Write-Host "✅ Started MongoDB container 'forgekeeper-mongo'."
        }
    } else {
        Write-Warning '⚠️ mongod not found. Install MongoDB manually.'
    }
}

if ($useDefaults) {
    $choice = '1'
    $modelDir = './models'
    $install = 'y'

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

    $modelDir = Read-Host 'Model storage directory [./models]'
    if ([string]::IsNullOrWhiteSpace($modelDir)) { $modelDir = './models' }
    $install = Read-Host 'Install Node dependencies and launch services? [y/N]'
}


$env:MODEL_DIR = $modelDir

if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $rootDir '.env.example') $envFile }

$content = @()
if (Test-Path $envFile) {
    $content = Get-Content $envFile | Where-Object {$_ -notmatch '^MODEL_DIR='}
}
$content += "MODEL_DIR=$modelDir"
Set-Content -Path $envFile -Value $content

if ($install -match '^[Yy]') {
    if ($choice -eq '2') {
        if ($useDefaults) {
            & (Join-Path $scriptDir 'setup_docker_env.ps1') -Defaults
        } else {
            & (Join-Path $scriptDir 'setup_docker_env.ps1')
        }
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

Write-Host "To start the stack later, run scripts/start_local_stack.ps1"
