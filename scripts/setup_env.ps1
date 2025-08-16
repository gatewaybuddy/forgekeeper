#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path
$envFile = Join-Path $rootDir '.env'

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

# --- gather env vars ---
Prompt-Var 'FRONTEND_PORT' '3000'
Prompt-Var 'BACKEND_PORT' '8000'
Prompt-Var 'PYTHON_PORT' '5000'
Prompt-Var 'MONGO_URI' 'mongodb://localhost:27017/forgekeeper'
Prompt-Secret 'OPENAI_API_KEY' ''
Prompt-Var 'LLM_BACKEND' 'vllm'
Prompt-Var 'VLLM_PORT_CORE' '8001'
Prompt-Var 'VLLM_PORT_CODER' '8002'
Prompt-Var 'VLLM_MODEL_CORE' 'mistral-nemo-instruct'
Prompt-Var 'VLLM_MODEL_CODER' 'codellama-13b-python'
Prompt-Var 'VLLM_TP' '1'
Prompt-Var 'VLLM_MAX_MODEL_LEN' '4096'
Prompt-Var 'VLLM_GPU_MEMORY_UTILIZATION' '0.9'

$content = @(
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
Set-Content -Path $envFile -Value $content

Write-Host '✅ Environment configuration written to .env'
