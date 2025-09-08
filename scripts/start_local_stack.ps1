#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [switch]$Detach,
    [string]$LogDir
)

Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error '? npm is required but was not found.'
    exit 1
}

$python = $null
if (Get-Command python3 -ErrorAction SilentlyContinue) {
    $python = 'python3'
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $python = 'python'
} else {
    Write-Error '? python is required but was not found.'
    exit 1
}

# Ensure MongoDB is running (local or Docker)
if (-not (Get-Process mongod -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Warning '?? mongod not running and docker not found. Please start MongoDB manually.'
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

if ($Detach) {
    if (-not $LogDir) {
        $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
        $LogDir = Join-Path $rootDir (Join-Path 'logs' "start-$ts")
    }
    New-Item -Force -ItemType Directory -Path $LogDir | Out-Null

    Write-Host "🔧 Detach mode: starting services and returning control."
    Write-Host "📝 Logs: $LogDir"

    $backend = Start-Process npm -ArgumentList 'run dev --prefix backend' -RedirectStandardOutput (Join-Path $LogDir 'backend.out.log') -RedirectStandardError (Join-Path $LogDir 'backend.err.log') -WindowStyle Minimized -PassThru
    $pythonProc = Start-Process $python -ArgumentList '-m forgekeeper' -RedirectStandardOutput (Join-Path $LogDir 'python.out.log') -RedirectStandardError (Join-Path $LogDir 'python.err.log') -WindowStyle Minimized -PassThru
    $frontend = Start-Process npm -ArgumentList 'run dev --prefix frontend' -RedirectStandardOutput (Join-Path $LogDir 'frontend.out.log') -RedirectStandardError (Join-Path $LogDir 'frontend.err.log') -WindowStyle Minimized -PassThru

    $meta = [ordered]@{
        backendPid  = $backend.Id
        pythonPid   = $pythonProc.Id
        frontendPid = $frontend.Id
        logDir      = $LogDir
        startedAt   = (Get-Date).ToString('o')
    }
    ($meta | ConvertTo-Json) | Set-Content (Join-Path $LogDir 'pids.json')

    Write-Host ("✅ Started. PIDs => backend={0}, python={1}, frontend={2}" -f $backend.Id, $pythonProc.Id, $frontend.Id)
    Write-Host "➡️  Stop with: Stop-Process -Id <pid> (or close the apps)"
    exit 0
}
else {
    Write-Host "🚀 Starting services (child processes). Press Ctrl+C here to stop all."
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
}
