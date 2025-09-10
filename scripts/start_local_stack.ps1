#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [switch]$Detach,
    [string]$LogDir,
    [switch]$ResetPrefs,
    [switch]$RequireVLLM,
    [int]$VLLMWaitSeconds = 90,
    [switch]$RequireBackend,
    [int]$BackendWaitSeconds = 60,
    [switch]$CliOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-DebugLog { param([string]$Message) Write-Verbose $Message }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
Set-Location $rootDir

# Reset saved preferences when requested
if ($ResetPrefs) {
    $prefsJson = Join-Path $rootDir '.forgekeeper/start_prefs.json'
    if (Test-Path $prefsJson) { Remove-Item -Force $prefsJson -ErrorAction SilentlyContinue }
}

# Load saved preferences if present (overridden by explicit params)
$prefsPath = Join-Path $rootDir '.forgekeeper/start_prefs.json'
if (Test-Path $prefsPath) {
    try {
        $prefs = Get-Content $prefsPath -Raw | ConvertFrom-Json
        if (-not $PSBoundParameters.ContainsKey('CliOnly') -and $null -ne $prefs.CliOnly) { $CliOnly = [bool]$prefs.CliOnly }
        if (-not $PSBoundParameters.ContainsKey('RequireVLLM') -and $null -ne $prefs.RequireVLLM) { $RequireVLLM = [bool]$prefs.RequireVLLM }
        if (-not $PSBoundParameters.ContainsKey('VLLMWaitSeconds') -and $null -ne $prefs.VLLMWaitSeconds) { $VLLMWaitSeconds = [int]$prefs.VLLMWaitSeconds }
        if (-not $PSBoundParameters.ContainsKey('RequireBackend') -and $null -ne $prefs.RequireBackend) { $RequireBackend = [bool]$prefs.RequireBackend }
        if (-not $PSBoundParameters.ContainsKey('BackendWaitSeconds') -and $null -ne $prefs.BackendWaitSeconds) { $BackendWaitSeconds = [int]$prefs.BackendWaitSeconds }
        if (-not $env:FGK_USE_INFERENCE -and $null -ne $prefs.UseInference) { $env:FGK_USE_INFERENCE = ($prefs.UseInference ? '1' : '0') }
    } catch { Write-Verbose "Failed to load start preferences: $($_.Exception.Message)" }
}

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

if ($CliOnly) { $env:CLI_ONLY = 'true' }

# Interactive prompt on first run if no params, no prefs, and no env override
if ($PSBoundParameters.Count -eq 0 -and -not (Test-Path $prefsPath) -and -not $env:CLI_ONLY) {
    Write-Host 'First run setup: choose how to start Forgekeeper'
    $ans = Read-Host 'Run in CLI-only mode (Python agent only)? [y/N]'
    if ($ans -match '^[Yy]$') { $CliOnly = $true; $env:CLI_ONLY = 'true' } else { $CliOnly = $false }
    if (-not $CliOnly) {
        $ans = Read-Host 'Use inference gateway if available? [Y/n]'
        if ($ans -match '^[Nn]$') { $env:FGK_USE_INFERENCE = '0' } else { $env:FGK_USE_INFERENCE = '1' }
        $ans = Read-Host 'Require vLLM health before continuing? [y/N]'
        $RequireVLLM = ($ans -match '^[Yy]$')
        $ans = Read-Host 'Require backend health before continuing? [y/N]'
        $RequireBackend = ($ans -match '^[Yy]$')
    }
    $save = Read-Host 'Save these as defaults to .forgekeeper/start_prefs.json? [y/N]'
    if ($save -match '^[Yy]$') {
        New-Item -Force -ItemType Directory -Path (Join-Path $rootDir '.forgekeeper') | Out-Null
        $prefsObj = [ordered]@{
            CliOnly = [bool]$CliOnly
            UseInference = ([string]$env:FGK_USE_INFERENCE -ne '0')
            RequireVLLM = [bool]$RequireVLLM
            VLLMWaitSeconds = [int]$VLLMWaitSeconds
            RequireBackend = [bool]$RequireBackend
            BackendWaitSeconds = [int]$BackendWaitSeconds
        }
        ($prefsObj | ConvertTo-Json) | Set-Content -Path $prefsPath -Encoding UTF8
        Write-Host "Saved defaults to $prefsPath"
    }
}

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

# Inference Gateway integration (skipped in CLI-only mode)
if (-not $env:FGK_USE_INFERENCE) { $env:FGK_USE_INFERENCE = '1' }
if ($env:FGK_USE_INFERENCE -ne '0' -and -not $CliOnly) {
    if (-not $env:FGK_INFER_URL) { $env:FGK_INFER_URL = 'http://localhost:8080' }
    if (-not $env:FGK_INFER_KEY) { $env:FGK_INFER_KEY = 'dev-key' }
    $env:FK_CORE_API_BASE = $env:FGK_INFER_URL
    $env:FK_CODER_API_BASE = $env:FGK_INFER_URL
    $env:FK_API_KEY = $env:FGK_INFER_KEY
    Write-DebugLog "Using inference gateway at $env:FGK_INFER_URL"
    try {
        $health = ($env:FGK_INFER_URL.TrimEnd('/')) + '/healthz'
        $ok = $false
        try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $r.StatusCode -eq 200 } catch { $ok = $false }
        if (-not $ok) {
            if (Get-Command make -ErrorAction SilentlyContinue) {
                $reply = Read-Host 'Start local inference stack now? [Y/n]'
                if ($reply -match '^([Yy]|)$') {
                    pushd $rootDir; make inference-up; popd
                }
            } else {
                Write-Warning "'make' not found; start inference stack manually (see DOCS_INFERENCE.md)."
            }
        }
    } catch { Write-Warning "Inference gateway pre-check failed: $($_.Exception.Message)" }
    if (-not $env:VLLM_MODEL_CORE) {
        Write-Host 'Select model for VLLM_MODEL_CORE:'
        Write-Host '  [1] mistralai/Mistral-7B-Instruct'
        Write-Host '  [2] WizardLM/WizardCoder-15B-V1.0'
        Write-Host '  [3] gpt-oss-20b-harmony'
        Write-Host '  [4] Custom'
        $choice = Read-Host 'Enter choice [1-4]'
        switch ($choice) {
            '2' { $env:VLLM_MODEL_CORE = 'WizardLM/WizardCoder-15B-V1.0' }
            '3' { $env:VLLM_MODEL_CORE = 'gpt-oss-20b-harmony' }
            '4' { $env:VLLM_MODEL_CORE = (Read-Host 'Enter model id') }
            default { $env:VLLM_MODEL_CORE = 'mistralai/Mistral-7B-Instruct' }
        }
    }
    if (-not $env:VLLM_MODEL_CODER) {
        $reply = Read-Host 'Use WizardCoder for coder model? [Y/n]'
        if ($reply -match '^([Yy]|)$') { $env:VLLM_MODEL_CODER = 'WizardLM/WizardCoder-15B-V1.0' } else { $env:VLLM_MODEL_CODER = $env:VLLM_MODEL_CORE }
    }
}

# Ensure MongoDB is running (local or Docker) unless CLI-only
if (-not $CliOnly -and -not (Get-Process mongod -ErrorAction SilentlyContinue)) {
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

    if ($CliOnly) {
        $pythonProc = Start-Process -FilePath $python -ArgumentList @('-m','forgekeeper') -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'python.out.log') -RedirectStandardError (Join-Path $LogDir 'python.err.log') -WindowStyle Minimized -PassThru
        $meta = [ordered]@{ pythonPid = $pythonProc.Id; logDir = $LogDir; startedAt = (Get-Date).ToString('o') }
        ($meta | ConvertTo-Json) | Set-Content (Join-Path $LogDir 'pids.json')
        Write-Host ("✅ Started CLI-only. PID => python={0}" -f $pythonProc.Id)
    } else {
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
    }
    Write-Host "➡️  Stop with: Stop-Process -Id <pid> (or close the apps)"
    exit 0
}
else {
    if ($CliOnly) { Write-Host "🚀 Starting Python agent in this window (CLI-only). Press Ctrl+C to stop." } else { Write-Host "🚀 Starting services in this window. Press Ctrl+C to stop all." }
    
    # Ensure vLLM core server is running and optionally wait strictly
    $vllmProc = $null
    try {
        $health = "$($env:FK_CORE_API_BASE.TrimEnd('/'))/healthz"
        $ok = $false
        try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch {}
        if (-not $ok) {
            Write-Host "⚙️  Launching vLLM core server..."
            $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
            $fgLogDir = Join-Path $rootDir (Join-Path 'logs' "start-fg-$ts")
            New-Item -Force -ItemType Directory -Path $fgLogDir | Out-Null
            $vllmOut = Join-Path $fgLogDir 'vllm_core.out.log'
            $vllmErr = Join-Path $fgLogDir 'vllm_core.err.log'

            $hasVllm = $false
            $null = & $python -c "import vllm" 2>$null
            if ($LASTEXITCODE -eq 0) { $hasVllm = $true }
            $useDocker = -not $hasVllm
            if ($useDocker -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
                Write-Warning 'vLLM not available in Python and docker not found; cannot launch vLLM automatically.'
            }

            if ($useDocker) {
                # Start dockerized vLLM detached; logs via docker logs
                Write-Host '🐳 Starting dockerized vLLM (forgekeeper-vllm-core)...'
                & pwsh -NoProfile -File (Join-Path $rootDir 'scripts/start_vllm_core_docker.ps1') | Tee-Object -FilePath $vllmOut | Out-Null
                $vllmProc = $null  # managed by docker, not this shell
                Write-Host '👉 View logs: docker logs -f forgekeeper-vllm-core'
            } else {
                # Launch local Python vLLM using the same interpreter we detected
                $args = @('-m','vllm.entrypoints.openai.api_server','--host','0.0.0.0','--port',$env:VLLM_PORT_CORE,'--model',$env:VLLM_MODEL_CORE,'--tensor-parallel-size',($env:VLLM_TP ?? '1'),'--max-model-len',($env:VLLM_MAX_MODEL_LEN ?? '4096'),'--gpu-memory-utilization',($env:VLLM_GPU_MEMORY_UTILIZATION ?? '0.9'))
                $vllmProc = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $rootDir -RedirectStandardOutput $vllmOut -RedirectStandardError $vllmErr -WindowStyle Minimized -PassThru
                Write-Host "📝 vLLM logs: $vllmOut, $vllmErr"
            }
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
    if ($CliOnly) {
        $pythonProc = Start-Process -FilePath $python -ArgumentList @('-m','forgekeeper') -WorkingDirectory $rootDir -NoNewWindow -PassThru
        $processes = @($pythonProc)
    } else {
        # Start backend first, and optionally wait for health before launching frontend
        $backend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','backend','run','dev') -WorkingDirectory $rootDir -NoNewWindow -PassThru

        $backendPort = if ($env:PORT) { [int]$env:PORT } else { 4000 }
        $backendHealth = "http://localhost:$backendPort/health"
        $initialBWait = if ($RequireBackend) { $BackendWaitSeconds } else { [Math]::Min(10, $BackendWaitSeconds) }
        $deadlineB = (Get-Date).AddSeconds($initialBWait)
        do {
            Start-Sleep -Seconds 1
            try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $backendHealth; $bOk = $r.StatusCode -eq 200 } catch { $bOk = $false }
        } while (-not $bOk -and (Get-Date) -lt $deadlineB)
        if ($bOk) { Write-Host "✅ Backend is healthy at $backendHealth" } else {
            if ($RequireBackend) {
                Write-Error "❌ Backend did not become healthy at $backendHealth; aborting due to -RequireBackend"
                exit 1
            } else {
                Write-Warning "⚠️ Backend not healthy yet at $backendHealth; continuing"
            }
        }

        $pythonProc = Start-Process -FilePath $python -ArgumentList @('-m','forgekeeper') -WorkingDirectory $rootDir -NoNewWindow -PassThru
        $frontend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','frontend','run','dev') -WorkingDirectory $rootDir -NoNewWindow -PassThru

        $processes = @()
        if ($vllmProc -and -not $vllmProc.HasExited) { $processes += $vllmProc }
        $processes += @($backend, $pythonProc, $frontend) | Where-Object { $_ -and -not $_.HasExited }
    }

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
