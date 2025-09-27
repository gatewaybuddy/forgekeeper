#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
$envFile = Join-Path $rootDir '.env'
$modelsDir = Join-Path $rootDir 'forgekeeper/models'
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Path $modelsDir | Out-Null }
Write-Host "Using models directory: $modelsDir"
$models = @(Get-ChildItem $modelsDir -File | Select-Object -ExpandProperty Name)

# --- load existing env if present ---
if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object {$_ -notmatch '^#'} | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        if ($name) { Set-Item -Path "Env:$name" -Value $value }
    }
}

function Prompt-Var {
    param($Name, $Default)
    $item = Get-Item "Env:$Name" -ErrorAction SilentlyContinue
    $current = if ($item) { $item.Value } else { $null }
    $fallback = if ($current) { $current } else { $Default }
    $input = Read-Host "$Name [$fallback]"
    if ([string]::IsNullOrEmpty($input)) { $input = $fallback }
    Set-Item -Path "Env:$Name" -Value $input
}

function Prompt-Secret {
    param($Name, $Default)
    $item = Get-Item "Env:$Name" -ErrorAction SilentlyContinue
    $current = if ($item) { $item.Value } else { $null }
    $fallback = if ($current) { $current } else { $Default }
    $secure = Read-Host "$Name [$fallback]" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $input = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    if ([string]::IsNullOrEmpty($input)) { $input = $fallback }
    Set-Item -Path "Env:$Name" -Value $input
}

function Choose-Model {
    param($Name)
    if ($models.Count -eq 0) {
        Write-Host "`nNo models found in $modelsDir. Enter full path or model name:"
        $current = (Get-Item "Env:$Name" -ErrorAction SilentlyContinue).Value
        $input = Read-Host "$Name [$current]"
        if ([string]::IsNullOrEmpty($input)) { $input = $current }
        Set-Item -Path "Env:$Name" -Value $input
        return
    }

    Write-Host "`nAvailable models:"
    for ($i = 0; $i -lt $models.Count; $i++) {
        Write-Host "[$($i + 1)] $($models[$i])"
    }

    $current = (Get-Item "Env:$Name" -ErrorAction SilentlyContinue).Value
    $currentBase = if ($current) { [System.IO.Path]::GetFileName($current) } else { $null }
    $defaultIndex = if ($currentBase) { ([array]::IndexOf($models, $currentBase) + 1) } else { 1 }
    if ($defaultIndex -lt 1) { $defaultIndex = 1 }

    $sel = Read-Host "$Name selection [$defaultIndex]"
    if ([string]::IsNullOrEmpty($sel)) { $sel = $defaultIndex }

    if ($sel -as [int] -and $sel -ge 1 -and $sel -le $models.Count) {
        $choice = Join-Path $modelsDir $models[$sel - 1]
    } else {
        $choice = $sel
    }
    Set-Item -Path "Env:$Name" -Value $choice
}

# --- gather env vars ---
Prompt-Var 'FRONTEND_PORT' '3000'
Prompt-Var 'BACKEND_PORT' '8000'
Prompt-Var 'PYTHON_PORT' '5000'
Prompt-Var 'MONGO_URI' 'mongodb://localhost:27017/forgekeeper?directConnection=true&retryWrites=false'
Prompt-Secret 'OPENAI_API_KEY' ''
Prompt-Var 'LLM_BACKEND' 'vllm'
if ($env:LLM_BACKEND -eq 'llama_cpp') {
    Choose-Model 'FK_MODEL_PATH'
    Prompt-Var 'FK_THREADS' '4'
    Prompt-Var 'FK_GPU_LAYERS' '0'
} else {
    Prompt-Var 'VLLM_PORT_CORE' '8001'
    Prompt-Var 'VLLM_PORT_CODER' '8002'
    Choose-Model 'VLLM_MODEL_CORE'
    Choose-Model 'VLLM_MODEL_CODER'
    Prompt-Var 'VLLM_TP' '1'
    Prompt-Var 'VLLM_MAX_MODEL_LEN' '4096'
    Prompt-Var 'VLLM_GPU_MEMORY_UTILIZATION' '0.9'
}

$content = if ($env:LLM_BACKEND -eq 'llama_cpp') {
    @(
        "FRONTEND_PORT=$env:FRONTEND_PORT",
        "BACKEND_PORT=$env:BACKEND_PORT",
        "PYTHON_PORT=$env:PYTHON_PORT",
        "MONGO_URI=$env:MONGO_URI",
        "OPENAI_API_KEY=$env:OPENAI_API_KEY",
        "LLM_BACKEND=$env:LLM_BACKEND",
        "FK_MODEL_PATH=$env:FK_MODEL_PATH",
        "FK_THREADS=$env:FK_THREADS",
        "FK_GPU_LAYERS=$env:FK_GPU_LAYERS"
    )
} else {
    @(
        "FRONTEND_PORT=$env:FRONTEND_PORT",
        "BACKEND_PORT=$env:BACKEND_PORT",
        "PYTHON_PORT=$env:PYTHON_PORT",
        "MONGO_URI=$env:MONGO_URI",
        "OPENAI_API_KEY=$env:OPENAI_API_KEY",
        "LLM_BACKEND=$env:LLM_BACKEND",
        "VLLM_PORT_CORE=$env:VLLM_PORT_CORE",
        "VLLM_PORT_CODER=$env:VLLM_PORT_CODER",
        "VLLM_MODEL_CORE=$env:VLLM_MODEL_CORE",
        "VLLM_MODEL_CODER=$env:VLLM_MODEL_CODER",
        "VLLM_TP=$env:VLLM_TP",
        "VLLM_MAX_MODEL_LEN=$env:VLLM_MAX_MODEL_LEN",
        "VLLM_GPU_MEMORY_UTILIZATION=$env:VLLM_GPU_MEMORY_UTILIZATION"
    )
}
Set-Content -Path $envFile -Value $content

Write-Host '✅ Environment configuration written to .env'
