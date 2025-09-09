#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [switch]$Detach,
    [string]$LogDir,
    [switch]$RequireVLLM,
    [int]$VLLMWaitSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-DebugLog { param([string]$Message) Write-Verbose $Message }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

# Load .env into current session (simple KEY=VALUE parser)
$dotenvPath = Join-Path $rootDir '.env'
if (Test-Path $dotenvPath) {
    Get-Content $dotenvPath | ForEach-Object {
        if (-not $_ -or $_.StartsWith('#')) { return }
        if ($_ -match '^(?<k>[A-Za-z_][A-Za-z0-9_]*)=(?<v>.*)$') {
            $k = $Matches['k']; $v = $Matches['v']
            if ($v -and $v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
            if ($v -and $v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
            if (-not [string]::IsNullOrWhiteSpace($k)) { Set-Item -Path ("Env:" + $k) -Value $v }
        }
    }
}

# Enable DEBUG_MODE when -Verbose is supplied
if ($PSBoundParameters.ContainsKey('Verbose') -or $VerbosePreference -eq 'Continue') { $env:DEBUG_MODE = 'true' }
Write-DebugLog "DEBUG_MODE=$env:DEBUG_MODE"

# Resolve npm path robustly on Windows (prefer npm.cmd)
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmd) {
    $npmPath = $npmCmd.Source
} else {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
        Write-Error '? npm is required but was not found.'
        exit 1
    }
    $npmPath = $npm.Source
}

$python = $null
$venvPython = Join-Path '.venv' 'Scripts/python.exe'
if (Test-Path $venvPython) {
    $python = $venvPython
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $python = 'python3'
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $python = 'python'
} else {
    Write-Error '? python is required but was not found.'
    exit 1
}

# Default Prisma connection string if not set
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = 'mongodb://localhost:27017/forgekeeper'
}

# Default LLM API bases to local vLLM if not set
if (-not $env:VLLM_PORT_CORE) { $env:VLLM_PORT_CORE = '8001' }
if (-not $env:FK_CORE_API_BASE) { $env:FK_CORE_API_BASE = "http://localhost:$($env:VLLM_PORT_CORE)" }
if (-not $env:FK_CODER_API_BASE) { $env:FK_CODER_API_BASE = $env:FK_CORE_API_BASE }
Write-DebugLog "FK_CORE_API_BASE=$env:FK_CORE_API_BASE"
Write-DebugLog "FK_CODER_API_BASE=$env:FK_CODER_API_BASE"

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

    # Optionally start vLLM in detached mode as well
    $vllmProc = $null
    try {
        if (-not $env:VLLM_PORT_CORE) { $env:VLLM_PORT_CORE = '8001' }
        if (-not $env:FK_CORE_API_BASE) { $env:FK_CORE_API_BASE = "http://localhost:$($env:VLLM_PORT_CORE)" }
        if (-not $env:FK_CODER_API_BASE) { $env:FK_CODER_API_BASE = $env:FK_CORE_API_BASE }
        $health = "$($env:FK_CORE_API_BASE.TrimEnd('/'))/healthz"
        $ok = $false
        try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch {}
        if (-not $ok) {
            Write-Host "⚙️  Launching vLLM core server (detached)..."
            $vllmOut = Join-Path $LogDir 'vllm_core.out.log'
            $vllmErr = Join-Path $LogDir 'vllm_core.err.log'
            $vllmProc = Start-Process -FilePath "cmd.exe" -ArgumentList @('/c','scripts\run_vllm_core.bat') -WorkingDirectory $rootDir -RedirectStandardOutput $vllmOut -RedirectStandardError $vllmErr -WindowStyle Minimized -PassThru
            $initialWait = if ($RequireVLLM) { $VLLMWaitSeconds } else { [Math]::Min(10, $VLLMWaitSeconds) }
            $deadline = (Get-Date).AddSeconds($initialWait)
            do {
                Start-Sleep -Seconds 2
                try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch { $ok = $false }
            } while (-not $ok -and (Get-Date) -lt $deadline)
            if (-not $ok) {
                if ($RequireVLLM) {
                    Write-Error "❌ vLLM health check did not pass at $health; aborting due to -RequireVLLM"
                    exit 1
                } else {
                    Write-Warning "⚠️ vLLM not healthy yet at $health; continuing to launch other services"
                }
            } else { Write-Host "✅ vLLM is healthy at $health" }
        } else { Write-Host "✅ vLLM already healthy at $health" }
    } catch { Write-Warning "⚠️ vLLM pre-check failed: $($_.Exception.Message)" }

    $backend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','backend','run','dev') -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'backend.out.log') -RedirectStandardError (Join-Path $LogDir 'backend.err.log') -WindowStyle Minimized -PassThru
    $pythonProc = Start-Process -FilePath $python -ArgumentList @('-m','forgekeeper') -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'python.out.log') -RedirectStandardError (Join-Path $LogDir 'python.err.log') -WindowStyle Minimized -PassThru
    $frontend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','frontend','run','dev') -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'frontend.out.log') -RedirectStandardError (Join-Path $LogDir 'frontend.err.log') -WindowStyle Minimized -PassThru

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
    Write-Host "🚀 Starting services in this window. Press Ctrl+C to stop all."
    
    # Ensure vLLM core server is running and optionally wait strictly
    $vllmProc = $null
    try {
        $health = "$($env:FK_CORE_API_BASE.TrimEnd('/'))/healthz"
        $ok = $false
        try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch {}
        if (-not $ok) {
            Write-Host "⚙️  Launching vLLM core server..."
            $vllmProc = Start-Process -FilePath "cmd.exe" -ArgumentList @('/c','scripts\run_vllm_core.bat') -WorkingDirectory $rootDir -WindowStyle Minimized -PassThru
            $initialWait = if ($RequireVLLM) { $VLLMWaitSeconds } else { [Math]::Min(10, $VLLMWaitSeconds) }
            $deadline = (Get-Date).AddSeconds($initialWait)
            do {
                Start-Sleep -Seconds 2
                try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch { $ok = $false }
            } while (-not $ok -and (Get-Date) -lt $deadline)
            if (-not $ok) {
                if ($RequireVLLM) {
                    Write-Error "❌ vLLM health check did not pass at $health; aborting due to -RequireVLLM"
                    exit 1
                } else {
                    Write-Warning "⚠️ vLLM not healthy yet at $health; continuing to launch other services"
                }
            } else { Write-Host "✅ vLLM is healthy at $health" }
        } else {
            Write-Host "✅ vLLM already healthy at $health"
        }
    } catch {
        Write-Warning "⚠️ vLLM pre-check failed: $($_.Exception.Message)"
    }
    # Start backend first, and optionally wait for health before launching frontend
    $backend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','backend','run','dev') -WorkingDirectory $rootDir -NoNewWindow -PassThru

    $backendPort = if ($env:PORT) { [int]$env:PORT } else { 4000 }
    $backendHealth = "http://localhost:$backendPort/health"
    $initialBWait = if ($RequireVLLM) { 60 } else { 10 }  # default 60s if strict backend wait is later added; for now, short wait
    $deadlineB = (Get-Date).AddSeconds($initialBWait)
    do {
        Start-Sleep -Seconds 1
        try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $backendHealth; $bOk = $r.StatusCode -eq 200 } catch { $bOk = $false }
    } while (-not $bOk -and (Get-Date) -lt $deadlineB)
    if ($bOk) { Write-Host "✅ Backend is healthy at $backendHealth" } else { Write-Warning "⚠️ Backend not healthy yet at $backendHealth; continuing" }

    $pythonProc = Start-Process -FilePath $python -ArgumentList @('-m','forgekeeper') -WorkingDirectory $rootDir -NoNewWindow -PassThru
    $frontend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','frontend','run','dev') -WorkingDirectory $rootDir -NoNewWindow -PassThru

    $processes = @()
    if ($vllmProc -and -not $vllmProc.HasExited) { $processes += $vllmProc }
    $processes += @($backend, $pythonProc, $frontend) | Where-Object { $_ -and -not $_.HasExited }

    try {
        while ($true) {
            $live = @()
            foreach ($p in $processes) {
                if ($null -ne $p) {
                    try { $gp = Get-Process -Id $p.Id -ErrorAction Stop; $live += $gp } catch {}
                }
            }
            if ($live.Count -eq 0) { break }
            try { Wait-Process -Id ($live | ForEach-Object { $_.Id }) -Any -Timeout 5 -ErrorAction SilentlyContinue } catch {}
        }
    } finally {
        foreach ($p in $processes) {
            if ($null -ne $p) {
                try {
                    $proc = Get-Process -Id $p.Id -ErrorAction Stop
                    if ($proc -and -not $proc.HasExited) {
                        Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
                    }
                } catch {}
            }
        }
    }
}
