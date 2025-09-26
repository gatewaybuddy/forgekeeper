#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [switch]$Detach,
    [string]$LogDir,
    [switch]$ResetPrefs,
    [switch]$RequireLLM,
    [int]$LLMWaitSeconds = 90,
    [switch]$RequireBackend,
    [int]$BackendWaitSeconds = 60,
    [switch]$CliOnly,
    [string]$ModelCore,
    [string]$ModelCoder,
    [ValidateSet('vllm','triton')] [string]$Backend = 'vllm',
    [switch]$Conversation
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
        if (-not $PSBoundParameters.ContainsKey('RequireLLM') -and $null -ne $prefs.RequireLLM) { $RequireLLM = [bool]$prefs.RequireLLM }
        if (-not $PSBoundParameters.ContainsKey('LLMWaitSeconds') -and $null -ne $prefs.LLMWaitSeconds) { $LLMWaitSeconds = [int]$prefs.LLMWaitSeconds }
        if (-not $PSBoundParameters.ContainsKey('Backend') -and $null -ne $prefs.Backend) { $Backend = $prefs.Backend }
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

# Optional model overrides via parameters
if ($PSBoundParameters.ContainsKey('ModelCore') -and $ModelCore) {
    $val = $ModelCore
    if (-not (Test-Path $val) -and (Test-Path (Join-Path $rootDir (Join-Path 'models' $val)))) {
        $val = (Join-Path 'models' $ModelCore)
    }
    $env:VLLM_MODEL_CORE = $val
}
if ($PSBoundParameters.ContainsKey('ModelCoder') -and $ModelCoder) {
    $val = $ModelCoder
    if (-not (Test-Path $val) -and (Test-Path (Join-Path $rootDir (Join-Path 'models' $val)))) {
        $val = (Join-Path 'models' $ModelCoder)
    }
    $env:VLLM_MODEL_CODER = $val
}
if ($env:VLLM_MODEL_CORE) { Write-Host "Using core model: $env:VLLM_MODEL_CORE" }
if ($env:VLLM_MODEL_CODER) { Write-Host "Using coder model: $env:VLLM_MODEL_CODER" }

# Interactive prompt on first run if no params, no prefs, and no env override
if ($PSBoundParameters.Count -eq 0 -and -not (Test-Path $prefsPath) -and -not $env:CLI_ONLY) {
    Write-Host 'First run setup: choose how to start Forgekeeper'
    $ans = Read-Host 'Run in CLI-only mode (Python agent only)? [y/N]'
    if ($ans -match '^[Yy]$') { $CliOnly = $true; $env:CLI_ONLY = 'true' } else { $CliOnly = $false }
    if (-not $CliOnly) {
        $ans = Read-Host 'Use inference gateway if available? [Y/n]'
        if ($ans -match '^[Nn]$') { $env:FGK_USE_INFERENCE = '0' } else { $env:FGK_USE_INFERENCE = '1' }
        $Backend = Read-Host 'Select LLM backend [vllm/triton] (default vllm)'
        if (-not $Backend) { $Backend = 'vllm' }
        if ($Backend -match '^(?i)triton$') { $Backend = 'triton' } else { $Backend = 'vllm' }
        $ans = Read-Host 'Require LLM health before continuing? [y/N]'
        $RequireLLM = ($ans -match '^[Yy]$')
        $ans = Read-Host 'Require backend health before continuing? [y/N]'
        $RequireBackend = ($ans -match '^[Yy]$')
    }
    $save = Read-Host 'Save these as defaults to .forgekeeper/start_prefs.json? [y/N]'
    if ($save -match '^[Yy]$') {
        New-Item -Force -ItemType Directory -Path (Join-Path $rootDir '.forgekeeper') | Out-Null
        $prefsObj = [ordered]@{
            CliOnly = [bool]$CliOnly
            UseInference = ([string]$env:FGK_USE_INFERENCE -ne '0')
            RequireLLM = [bool]$RequireLLM
            LLMWaitSeconds = [int]$LLMWaitSeconds
            Backend = $Backend
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
    $env:DATABASE_URL = 'mongodb://localhost:27017/forgekeeper?directConnection=true&retryWrites=false'
}

# Default LLM API bases to local vLLM if not set
if (-not $env:OPENAI_BASE_URL) { $env:OPENAI_BASE_URL = "http://localhost:$($env:VLLM_PORT_CORE)/v1" }
if (-not $env:OPENAI_API_KEY) { $env:OPENAI_API_KEY = 'dev-key' }
if (-not $env:VLLM_PORT_CORE) { $env:VLLM_PORT_CORE = '8001' }
if (-not $env:FK_CORE_API_BASE) { $env:FK_CORE_API_BASE = "http://localhost:$($env:VLLM_PORT_CORE)" }
if (-not $env:FK_CODER_API_BASE) { $env:FK_CODER_API_BASE = $env:FK_CORE_API_BASE }
Write-DebugLog "FK_CORE_API_BASE=$env:FK_CORE_API_BASE"
Write-DebugLog "FK_CODER_API_BASE=$env:FK_CODER_API_BASE"
Set-Item -Path Env:FGK_LLM_BACKEND -Value $Backend

# Inference Gateway integration (skipped in CLI-only mode)
if (-not $env:FGK_USE_INFERENCE) { $env:FGK_USE_INFERENCE = '1' }
if ($env:FGK_USE_INFERENCE -ne '0' -and -not $CliOnly) {
    if (-not $env:FGK_INFER_URL) { $env:FGK_INFER_URL = 'http://localhost:8080' }
    if (-not $env:FGK_INFER_KEY) { $env:FGK_INFER_KEY = 'dev-key' }
    Write-DebugLog "Checking inference gateway at $env:FGK_INFER_URL"
    $gwOk = $false
    try {
        $gwHealth = ($env:FGK_INFER_URL.TrimEnd('/')) + '/healthz'
        try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $gwHealth; $gwOk = $r.StatusCode -eq 200 } catch { $gwOk = $false }
        if (-not $gwOk) {
            if (Get-Command make -ErrorAction SilentlyContinue) {
                $reply = Read-Host 'Start local inference stack now? [Y/n]'
                if ($reply -match '^([Yy]|)$') {
                    pushd $rootDir; make inference-up; popd
                    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $gwHealth; $gwOk = $r.StatusCode -eq 200 } catch { $gwOk = $false }
                }
            } else {
                Write-Warning "'make' not found; start inference stack manually (see DOCS_INFERENCE.md)."
            }
        }
    } catch { Write-Warning "Inference gateway pre-check failed: $($_.Exception.Message)" }
    if ($gwOk) {
        $env:FK_CORE_API_BASE = $env:FGK_INFER_URL
        $env:FK_CODER_API_BASE = $env:FGK_INFER_URL
        $env:FK_API_KEY = $env:FGK_INFER_KEY
        Write-Host "Using inference gateway at $env:FGK_INFER_URL"
    } else {
        if ($Backend -eq 'triton') {
            # Prefer OpenAI-compatible TritonLLM gateway when TRITONLLM_URL is provided
            if ($env:TRITONLLM_URL) {
                $gwHealth = ($env:TRITONLLM_URL.TrimEnd('/')) + '/v1/chat/completions'
                $okGw = $false
                try {
                    $payload = '{"model":"oss-20b","messages":[{"role":"user","content":"ping"}],"stream":false,"max_tokens":1}'
                    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $gwHealth -Method Post -ContentType 'application/json' -Body $payload
                    $okGw = $r.StatusCode -eq 200
                } catch { $okGw = $false }
                if (-not $okGw) {
                    if (Get-Command docker -ErrorAction SilentlyContinue) {
                        $composePath = Join-Path (Split-Path $rootDir -Parent) 'forgekeeper-v2/docker-compose.tritonllm.yml'
                        if (Test-Path $composePath) {
                            if (-not $env:HOST_MODEL_DIR) { $env:HOST_MODEL_DIR = (Resolve-Path (Join-Path (Split-Path $composePath -Parent) 'models')).Path }
                            if (-not $env:CHECKPOINT) { $env:CHECKPOINT = '/models/gpt-oss-20b' }
                            Write-Host '??  Starting TritonLLM gateway via docker compose...'
                            & docker compose -f $composePath up -d | Out-Null
                            $initialWait = if ($RequireLLM) { $LLMWaitSeconds } else { [Math]::Min(10, $LLMWaitSeconds) }
                            $deadline = (Get-Date).AddSeconds($initialWait)
                            do {
                                Start-Sleep -Seconds 2
                                try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $gwHealth -Method Post -ContentType 'application/json' -Body $payload; $okGw = $r.StatusCode -eq 200 } catch { $okGw = $false }
                            } while (-not $okGw -and (Get-Date) -lt $deadline)
                            if ($okGw) { Write-Host "? TritonLLM gateway healthy at $gwHealth" }
                            elseif ($RequireLLM) { Write-Error "? TritonLLM gateway not healthy at $gwHealth; aborting"; exit 1 }
                            else { Write-Warning "?? TritonLLM gateway not healthy at $gwHealth; continuing" }
                        } else {
                            Write-Warning "docker-compose.tritonllm.yml not found at $composePath; skipping gateway auto-start."
                        }
                    } else {
                        Write-Warning 'Docker not found; cannot auto-start TritonLLM gateway.'
                    }
                } else { Write-Host "? TritonLLM gateway healthy at $gwHealth" }
            }
            $fallbackUrl = if ($env:TRITON_URL) { $env:TRITON_URL } else { 'http://localhost:8000' }
            Write-Warning "Inference gateway not available; using direct Triton at $fallbackUrl"
        } else {
            Write-Warning "Inference gateway not available; using direct vLLM at http://localhost:$($env:VLLM_PORT_CORE)"
        }
    }
    if ($Backend -eq 'vllm' -and -not $env:VLLM_MODEL_CORE) {
        Write-Host 'Select model for VLLM_MODEL_CORE:'
        Write-Host '  [1] oss-gpt-20b (default)'
        Write-Host '  [2] mistralai/Mistral-7B-Instruct'
        Write-Host '  [3] WizardLM/WizardCoder-15B-V1.0'
        Write-Host '  [4] Custom'
        $choice = Read-Host 'Enter choice [1-4]'
        switch ($choice) {
            '2' { $env:VLLM_MODEL_CORE = 'mistralai/Mistral-7B-Instruct' }
            '3' { $env:VLLM_MODEL_CORE = 'WizardLM/WizardCoder-15B-V1.0' }
            '4' { $env:VLLM_MODEL_CORE = (Read-Host 'Enter model id') }
            default { $env:VLLM_MODEL_CORE = 'oss-gpt-20b' }
        }
        Write-Host "Using core model: $env:VLLM_MODEL_CORE"
    }
    if ($Backend -eq 'vllm' -and -not $env:VLLM_MODEL_CODER) {
        $reply = Read-Host 'Use WizardCoder for coder model? [Y/n]'
        if ($reply -match '^([Yy]|)$') {
            $env:VLLM_MODEL_CODER = 'WizardLM/WizardCoder-15B-V1.0'
            Write-Host "Using coder model: $env:VLLM_MODEL_CODER"
        } else {
            if ($env:VLLM_MODEL_CORE) {
                $env:VLLM_MODEL_CODER = $env:VLLM_MODEL_CORE
            } else {
                $env:VLLM_MODEL_CODER = 'oss-gpt-20b'
            }
            Write-Host "WizardCoder disabled; using coder model: $env:VLLM_MODEL_CODER"
        }
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

    # Optionally start LLM in detached mode as well
    $llmProc = $null
    try {
        if ($Backend -eq 'triton') {
            if ($env:TRITONLLM_URL) {
                $gwHealth = ($env:TRITONLLM_URL.TrimEnd('/')) + '/v1/chat/completions'
                $okGw = $false
                try {
                    $payload = '{"model":"oss-20b","messages":[{"role":"user","content":"ping"}],"stream":false,"max_tokens":1}'
                    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $gwHealth -Method Post -ContentType 'application/json' -Body $payload
                    $okGw = $r.StatusCode -eq 200
                } catch { $okGw = $false }
                if (-not $okGw -and (Get-Command docker -ErrorAction SilentlyContinue)) {
                    $composePath = Join-Path (Split-Path $rootDir -Parent) 'forgekeeper-v2/docker-compose.tritonllm.yml'
                    if (Test-Path $composePath) {
                        if (-not $env:HOST_MODEL_DIR) { $env:HOST_MODEL_DIR = (Resolve-Path (Join-Path (Split-Path $composePath -Parent) 'models')).Path }
                        if (-not $env:CHECKPOINT) { $env:CHECKPOINT = '/models/gpt-oss-20b' }
                        Write-Host '??  Starting TritonLLM gateway via docker compose (detached)...'
                        & docker compose -f $composePath up -d | Out-Null
                        $initialWait = if ($RequireLLM) { $LLMWaitSeconds } else { [Math]::Min(10, $LLMWaitSeconds) }
                        $deadline = (Get-Date).AddSeconds($initialWait)
                        do {
                            Start-Sleep -Seconds 2
                            try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $gwHealth -Method Post -ContentType 'application/json' -Body $payload; $okGw = $r.StatusCode -eq 200 } catch { $okGw = $false }
                        } while (-not $okGw -and (Get-Date) -lt $deadline)
                        if ($okGw) { Write-Host "? TritonLLM gateway healthy at $gwHealth" }
                        elseif ($RequireLLM) { Write-Error "? TritonLLM gateway not healthy at $gwHealth; aborting"; exit 1 }
                        else { Write-Warning "?? TritonLLM gateway not healthy at $gwHealth; continuing" }
                    }
                }
            }
            if (-not $env:TRITON_URL) { $env:TRITON_URL = 'http://localhost:8000' }
            if (-not $env:TRITON_MODEL) { $env:TRITON_MODEL = 'gpt-oss-20b' }
            $health = $env:TRITON_URL.TrimEnd('/') + '/v2/health/ready'
            $ok = $false
            try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch {}
            if (-not $ok) {
                Write-Host "⚙️  Launching Triton server (detached)..."
                $tritonOut = Join-Path $LogDir 'triton.out.log'
                $tritonErr = Join-Path $LogDir 'triton.err.log'
                if (Get-Command tritonllm -ErrorAction SilentlyContinue) {
                    $llmProc = Start-Process -FilePath 'tritonllm' -ArgumentList @('--checkpoint',$env:TRITON_MODEL) -WorkingDirectory $rootDir -RedirectStandardOutput $tritonOut -RedirectStandardError $tritonErr -WindowStyle Minimized -PassThru
                } else {
                    $llmProc = Start-Process -FilePath $python -ArgumentList @('-m','tritonllm.gpt_oss.responses_api.serve','--checkpoint',$env:TRITON_MODEL) -WorkingDirectory $rootDir -RedirectStandardOutput $tritonOut -RedirectStandardError $tritonErr -WindowStyle Minimized -PassThru
                }
                $initialWait = if ($RequireLLM) { $LLMWaitSeconds } else { [Math]::Min(10, $LLMWaitSeconds) }
                $deadline = (Get-Date).AddSeconds($initialWait)
                do {
                    Start-Sleep -Seconds 2
                    try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch { $ok = $false }
                } while (-not $ok -and (Get-Date) -lt $deadline)
                if (-not $ok) {
                    if ($RequireLLM) {
                        Write-Error "❌ Triton health check did not pass at $health; aborting due to -RequireLLM"
                        exit 1
                    } else {
                        Write-Warning "⚠️ Triton not healthy yet at $health; continuing to launch other services"
                    }
                } else { Write-Host "✅ Triton is healthy at $health" }
            } else { Write-Host "✅ Triton already healthy at $health" }
        } else {
            if (-not $env:VLLM_PORT_CORE) { $env:VLLM_PORT_CORE = '8001' }
            if (-not $env:FK_CORE_API_BASE) { $env:FK_CORE_API_BASE = "http://localhost:$($env:VLLM_PORT_CORE)" }
            if (-not $env:FK_CODER_API_BASE) { $env:FK_CODER_API_BASE = $env:FK_CORE_API_BASE }
            $health = "http://localhost:$($env:VLLM_PORT_CORE)/health"
            $ok = $false
            try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch {}
            if (-not $ok) {
                Write-Host "⚙️  Launching vLLM core server (detached)..."
                $vllmOut = Join-Path $LogDir 'vllm_core.out.log'
                $vllmErr = Join-Path $LogDir 'vllm_core.err.log'
                $hasVllm = $false
                $null = & $python -c "import vllm" 2>$null
                if ($LASTEXITCODE -eq 0) { $hasVllm = $true }
                if ($hasVllm) {
                    $args = @('-m','vllm.entrypoints.openai.api_server','--host','0.0.0.0','--port',$env:VLLM_PORT_CORE,'--model',$env:VLLM_MODEL_CORE,'--tensor-parallel-size',($env:VLLM_TP ?? '1'),'--max-model-len',($env:VLLM_MAX_MODEL_LEN ?? '4096'),'--gpu-memory-utilization',($env:VLLM_GPU_MEMORY_UTILIZATION ?? '0.9'))
                    $llmProc = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $rootDir -RedirectStandardOutput $vllmOut -RedirectStandardError $vllmErr -WindowStyle Minimized -PassThru
                    Write-Host "?? vLLM logs: $vllmOut, $vllmErr"
                } elseif (Get-Command docker -ErrorAction SilentlyContinue) {
                    Write-Host '?? Starting dockerized vLLM (forgekeeper-vllm-core)...'
                    & pwsh -NoProfile -File (Join-Path $rootDir 'scripts/start_vllm_core_docker.ps1') | Tee-Object -FilePath $vllmOut | Out-Null
                    $llmProc = $null
                    Write-Host '?? View logs: docker logs -f forgekeeper-vllm-core'
                } else {
                    Write-Warning 'vLLM not available in Python and docker not found; continuing without LLM.'
                    $llmProc = $null
                }
                $initialWait = if ($RequireLLM) { $LLMWaitSeconds } else { [Math]::Min(10, $LLMWaitSeconds) }
                $deadline = (Get-Date).AddSeconds($initialWait)
                do {
                    Start-Sleep -Seconds 2
                    try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch { $ok = $false }
                } while (-not $ok -and (Get-Date) -lt $deadline)
                if (-not $ok) {
                    if ($RequireLLM) {
                        Write-Error "❌ vLLM health check did not pass at $health; aborting due to -RequireLLM"
                        exit 1
                    } else {
                        Write-Warning "⚠️ vLLM not healthy yet at $health; continuing to launch other services"
                    }
                } else { Write-Host "✅ vLLM is healthy at $health" }
            } else { Write-Host "✅ vLLM already healthy at $health" }
        }
    } catch { Write-Warning "⚠️ $Backend pre-check failed: $($_.Exception.Message)" }

    if ($CliOnly) {
        $modeValue = if ($Conversation) { 'duet' } else { 'single' }
        $argsPk = @('-m','forgekeeper_v2.cli','run','--mode',$modeValue)
        $pythonProc = Start-Process -FilePath $python -ArgumentList $argsPk -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'python.out.log') -RedirectStandardError (Join-Path $LogDir 'python.err.log') -WindowStyle Minimized -PassThru
        $meta = [ordered]@{ pythonPid = $pythonProc.Id; logDir = $LogDir; startedAt = (Get-Date).ToString('o') }
        ($meta | ConvertTo-Json) | Set-Content (Join-Path $LogDir 'pids.json')
        Write-Host ("✅ Started CLI-only. PID => python={0}" -f $pythonProc.Id)
    } else {
        $backendProc = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','backend','run','dev') -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'backend.out.log') -RedirectStandardError (Join-Path $LogDir 'backend.err.log') -WindowStyle Minimized -PassThru
        $modeValue = if ($Conversation) { 'duet' } else { 'single' }
        $argsPk = @('-m','forgekeeper_v2.cli','run','--mode',$modeValue)
        $pythonProc = Start-Process -FilePath $python -ArgumentList $argsPk -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'python.out.log') -RedirectStandardError (Join-Path $LogDir 'python.err.log') -WindowStyle Minimized -PassThru
        $frontend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','frontend','run','dev') -WorkingDirectory $rootDir -RedirectStandardOutput (Join-Path $LogDir 'frontend.out.log') -RedirectStandardError (Join-Path $LogDir 'frontend.err.log') -WindowStyle Minimized -PassThru
        $meta = [ordered]@{
            backendPid  = $backendProc.Id
            pythonPid   = $pythonProc.Id
            frontendPid = $frontend.Id
            llmPid      = if ($llmProc) { $llmProc.Id } else { $null }
            logDir      = $LogDir
            startedAt   = (Get-Date).ToString('o')
        }
        ($meta | ConvertTo-Json) | Set-Content (Join-Path $LogDir 'pids.json')
        Write-Host ("✅ Started. PIDs => backend={0}, python={1}, frontend={2}" -f $backendProc.Id, $pythonProc.Id, $frontend.Id)
    }
    Write-Host "➡️  Stop with: Stop-Process -Id <pid> (or close the apps)"
    exit 0
}
else {
    if ($CliOnly) { Write-Host "🚀 Starting Python agent in this window (CLI-only). Press Ctrl+C to stop." } else { Write-Host "🚀 Starting services in this window. Press Ctrl+C to stop all." }
    
    # Ensure selected LLM server is running and optionally wait strictly
    $llmProc = $null
    try {
        if ($Backend -eq 'triton') {
            if (-not $env:TRITON_URL) { $env:TRITON_URL = 'http://localhost:8000' }
            if (-not $env:TRITON_MODEL) { $env:TRITON_MODEL = 'gpt-oss-20b' }
            $health = $env:TRITON_URL.TrimEnd('/') + '/v2/health/ready'
            $ok = $false
            try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch {}
            if (-not $ok) {
                Write-Host "⚙️  Launching Triton server..."
                $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
                $fgLogDir = Join-Path $rootDir (Join-Path 'logs' "start-fg-$ts")
                New-Item -Force -ItemType Directory -Path $fgLogDir | Out-Null
                $tritonOut = Join-Path $fgLogDir 'triton.out.log'
                $tritonErr = Join-Path $fgLogDir 'triton.err.log'
                if (Get-Command tritonllm -ErrorAction SilentlyContinue) {
                    $llmProc = Start-Process -FilePath 'tritonllm' -ArgumentList @('--checkpoint',$env:TRITON_MODEL) -WorkingDirectory $rootDir -RedirectStandardOutput $tritonOut -RedirectStandardError $tritonErr -WindowStyle Minimized -PassThru
                } else {
                    $llmProc = Start-Process -FilePath $python -ArgumentList @('-m','tritonllm.gpt_oss.responses_api.serve','--checkpoint',$env:TRITON_MODEL) -WorkingDirectory $rootDir -RedirectStandardOutput $tritonOut -RedirectStandardError $tritonErr -WindowStyle Minimized -PassThru
                }
                $initialWait = if ($RequireLLM) { $LLMWaitSeconds } else { [Math]::Min(10, $LLMWaitSeconds) }
                $deadline = (Get-Date).AddSeconds($initialWait)
                do {
                    Start-Sleep -Seconds 2
                    try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch { $ok = $false }
                } while (-not $ok -and (Get-Date) -lt $deadline)
                if (-not $ok) {
                    if ($RequireLLM) {
                        Write-Error "❌ Triton health check did not pass at $health; aborting due to -RequireLLM"
                        exit 1
                    } else {
                        Write-Warning "⚠️ Triton not healthy yet at $health; continuing to launch other services"
                    }
                } else { Write-Host "✅ Triton is healthy at $health" }
            } else { Write-Host "✅ Triton already healthy at $health" }
        } else {
            $health = "http://localhost:$($env:VLLM_PORT_CORE)/health"
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
                    Write-Host '🐳 Starting dockerized vLLM (forgekeeper-vllm-core)...'
                    & pwsh -NoProfile -File (Join-Path $rootDir 'scripts/start_vllm_core_docker.ps1') | Tee-Object -FilePath $vllmOut | Out-Null
                    $llmProc = $null  # managed by docker, not this shell
                    Write-Host '👉 View logs: docker logs -f forgekeeper-vllm-core'
                } else {
                    $args = @('-m','vllm.entrypoints.openai.api_server','--host','0.0.0.0','--port',$env:VLLM_PORT_CORE,'--model',$env:VLLM_MODEL_CORE,'--tensor-parallel-size',($env:VLLM_TP ?? '1'),'--max-model-len',($env:VLLM_MAX_MODEL_LEN ?? '4096'),'--gpu-memory-utilization',($env:VLLM_GPU_MEMORY_UTILIZATION ?? '0.9'))
                    $llmProc = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $rootDir -RedirectStandardOutput $vllmOut -RedirectStandardError $vllmErr -WindowStyle Minimized -PassThru
                    Write-Host "📝 vLLM logs: $vllmOut, $vllmErr"
                }
                $initialWait = if ($RequireLLM) { $LLMWaitSeconds } else { [Math]::Min(10, $LLMWaitSeconds) }
                $deadline = (Get-Date).AddSeconds($initialWait)
                do {
                    Start-Sleep -Seconds 2
                    try { $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health; $ok = $resp.StatusCode -eq 200 } catch { $ok = $false }
                } while (-not $ok -and (Get-Date) -lt $deadline)
                if (-not $ok) {
                    if ($RequireLLM) {
                        Write-Error "❌ vLLM health check did not pass at $health; aborting due to -RequireLLM"
                        exit 1
                    } else {
                        Write-Warning "⚠️ vLLM not healthy yet at $health; continuing to launch other services"
                    }
                } else { Write-Host "✅ vLLM is healthy at $health" }
            } else {
                Write-Host "✅ vLLM already healthy at $health"
            }
        }
    } catch {
        Write-Warning "⚠️ $Backend pre-check failed: $($_.Exception.Message)"
    }
    if ($CliOnly) {
        $modeValue = if ($Conversation) { 'duet' } else { 'single' }
        $argsPk = @('-m','forgekeeper_v2.cli','run','--mode',$modeValue)
        $pythonProc = Start-Process -FilePath $python -ArgumentList $argsPk -WorkingDirectory $rootDir -NoNewWindow -PassThru
        $processes = @($pythonProc)
    } else {
        # Start backend first, and optionally wait for health before launching frontend
        $backendProc = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','backend','run','dev') -WorkingDirectory $rootDir -NoNewWindow -PassThru

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

        $modeValue = if ($Conversation) { 'duet' } else { 'single' }
        $argsPk = @('-m','forgekeeper_v2.cli','run','--mode',$modeValue)
        $pythonProc = Start-Process -FilePath $python -ArgumentList $argsPk -WorkingDirectory $rootDir -NoNewWindow -PassThru
        $frontend = Start-Process -FilePath $npmPath -ArgumentList @('--prefix','frontend','run','dev') -WorkingDirectory $rootDir -NoNewWindow -PassThru

        # Print friendly URLs for quick access
        $frontendPort = 5173
        $graphqlUrl = "http://localhost:$backendPort/graphql"
        Write-Host "[32mForgekeeper UI:[0m http://localhost:$frontendPort"
        Write-Host "[32mGraphQL API:[0m $graphqlUrl"
        Write-Host "[32mBackend health:[0m $backendHealth"

        $processes = @()
        if ($llmProc -and -not $llmProc.HasExited) { $processes += $llmProc }
        $processes += @($backendProc, $pythonProc, $frontend) | Where-Object { $_ -and -not $_.HasExited }
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
