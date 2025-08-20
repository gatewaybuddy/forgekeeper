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

if (-not (Test-Path '.venv')) {
    & $pythonExe @pythonArgs -m venv .venv
}

$venvPython = Join-Path '.venv' 'Scripts/python.exe'
if (-not (Test-Path $venvPython)) {
    $venvPython = Join-Path '.venv' 'bin/python'
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt

$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
    & npm install --prefix backend
    Push-Location backend
    & npx prisma generate
    Pop-Location
    & npm install --prefix frontend
} else {
    Write-Warning 'npm not found; skipping Node dependency installation.'
}

Write-Host '✅ Development environment setup complete.'
