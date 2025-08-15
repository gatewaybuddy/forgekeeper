#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

$python = Get-Command python3 -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python -ErrorAction SilentlyContinue }
if (-not $python) {
    Write-Error '❌ Python is required but was not found.'
    exit 1
}
$pythonPath = $python.Source

if (-not (Test-Path '.venv')) {
    & $pythonPath -m venv .venv
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
