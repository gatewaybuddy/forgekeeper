#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [switch]$PullImage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'docker is required to run vLLM in a container.'
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path

# Load .env defaults for local runs
$envFile = Join-Path $rootDir '.env'
if (Test-Path $envFile) {
    foreach ($rawLine in Get-Content $envFile) {
        $line = $rawLine.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
        $parts = $line.Split('=', 2)
        if ($parts.Count -ne 2) { continue }
        $key = $parts[0].Trim()
        if ([string]::IsNullOrWhiteSpace($key)) { continue }
        $value = $parts[1].Trim()
        if ($value.Length -gt 1 -and ((($value.StartsWith('"')) -and $value.EndsWith('"')) -or (($value.StartsWith("'")) -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $current = [System.Environment]::GetEnvironmentVariable($key, 'Process')
        if ([string]::IsNullOrEmpty($current)) {
            [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

$image = if ($env:DOCKER_VLLM_IMAGE) { $env:DOCKER_VLLM_IMAGE } else { 'vllm/vllm-openai:latest' }
$port = if ($env:VLLM_PORT_CORE) { $env:VLLM_PORT_CORE } else { '8001' }

if (-not $port) {
    Write-Error 'VLLM_PORT_CORE is not set (configure it in .env or the environment)'
    exit 1
}

if ($PullImage) {
    docker pull $image
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$container = 'forgekeeper-vllm-core'

$model = $env:VLLM_MODEL_CORE
if (-not $model) {
    Write-Error 'VLLM_MODEL_CORE must be set (configure it in .env or the environment)'
    exit 1
}

$hostModels = Join-Path $rootDir 'models'
if ((Test-Path $hostModels -PathType Container) -and ($model -match '^(\.?/)?models')) {
    $rel = $model -replace '^(\.?/)?models[\\/]*',''
    $modelArg = "/models/$rel"
    $volume = "${hostModels}:/models"
} else {
    $modelArg = $model
    $volume = $null
}

$existing = docker ps -aq -f name=^$container$
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($existing) {
    $running = docker ps -q -f name=^$container$
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($running) {
        Write-Host "vLLM container '$container' already running."
        exit 0
    } else {
        docker start $container | Out-Null
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Write-Host "Started existing vLLM container '$container'."
        exit 0
    }
}

$args = @(
    'run','-d','--name', $container,
    '--gpus','all',
    '-p', "${port}:8000"
)
if ($volume) { $args += @('-v', $volume) }
$args += @(
    $image,
    '--model', $modelArg,
    '--max-model-len', ($env:VLLM_MAX_MODEL_LEN ?? '4096'),
    '--tensor-parallel-size', ($env:VLLM_TP ?? '1'),
    '--gpu-memory-utilization', ($env:VLLM_GPU_MEMORY_UTILIZATION ?? '0.9')
)

$null = docker @args
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker run failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Launched vLLM container '$container' on http://localhost:$port"
