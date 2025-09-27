@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

if exist "%ROOT_DIR%\.env" (
  for /f "usebackq tokens=* delims=" %%a in ("%ROOT_DIR%\.env") do (
    set "line=%%a"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "!line!"
  )
)

python -m vllm.entrypoints.openai.api_server ^
  --host 0.0.0.0 ^
  --port %VLLM_PORT_CORE% ^
  --model %VLLM_MODEL_CORE% ^
  --tensor-parallel-size %VLLM_TP% ^
  --max-model-len %VLLM_MAX_MODEL_LEN% ^
  --gpu-memory-utilization %VLLM_GPU_MEMORY_UTILIZATION%

