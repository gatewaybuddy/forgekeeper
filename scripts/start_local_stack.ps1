#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error '❌ npm is required but was not found.'
    exit 1
}

$python = $null
if (Get-Command python3 -ErrorAction SilentlyContinue) {
    $python = 'python3'
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $python = 'python'
} else {
    Write-Error '❌ python is required but was not found.'
    exit 1
}

if (-not (Get-Process mongod -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Warning '⚠️ mongod not running and docker not found. Please start MongoDB manually.'
    } else {
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
    }
}

$backend = Start-Process npm -ArgumentList 'run dev --prefix backend' -PassThru
$pythonProc = Start-Process $python -ArgumentList '-m forgekeeper' -PassThru
$frontend = Start-Process npm -ArgumentList 'run dev --prefix frontend' -PassThru

$processes = @($backend, $pythonProc, $frontend)

try {
    Wait-Process -Id ($processes | ForEach-Object { $_.Id })
} finally {
    foreach ($p in $processes) {
        if (-not $p.HasExited) {
            Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
        }
    }
}
