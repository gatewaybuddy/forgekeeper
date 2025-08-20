#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

$pythonExe = $null
$pythonArgs = @()
if ($IsWindows) {
    $pythonExe = 'py'
    $pythonArgs = @('-3')
    $versionOutput = & $pythonExe @pythonArgs --version 2>&1
    if ($LASTEXITCODE -ne 0 -or $versionOutput -match 'Python was not found' -or $versionOutput -match 'App Execution Aliases') {
        Write-Error '❌ Python 3.x must be installed.'
        exit 1
    }
} else {
    $pythonExe = 'python3'
    $versionOutput = & $pythonExe --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        $pythonExe = 'python'
        $versionOutput = & $pythonExe --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error '❌ Python 3.x must be installed.'
            exit 1
        }
    }
}

$venvExitCode = 0
$venvOutput = $null
if (-not (Test-Path '.venv')) {
    $venvOutput = & $pythonExe @pythonArgs -m venv .venv 2>&1
    $venvExitCode = $LASTEXITCODE
}

if (-not (Test-Path '.venv') -or $venvExitCode -ne 0) {
    Write-Error "❌ Failed to create virtual environment. $venvOutput"
    exit 1
}

$venvPython = Join-Path '.venv' 'Scripts/python.exe'
if (-not (Test-Path $venvPython)) {
    $venvPython = Join-Path '.venv' 'bin/python'
}

if (-not (Test-Path $venvPython)) {
    Write-Error '❌ Virtual environment Python executable not found.'
    exit 1
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt

$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
    Push-Location backend
    & npm install
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if ($npx) {
        & npx prisma generate
    } else {
        Write-Warning 'npx not found; skipping Prisma client generation.'
    }
    Pop-Location

    Push-Location frontend
    & npm install
    Pop-Location
} else {
    Write-Warning 'npm not found; skipping Node dependency installation.'
}

Write-Host '✅ Development environment setup complete.'
