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

$image = if ($env:DOCKER_VLLM_IMAGE) { $env:DOCKER_VLLM_IMAGE } else { 'vllm/vllm-openai:latest' }
$port = if ($env:VLLM_PORT_CORE) { $env:VLLM_PORT_CORE } else { '8001' }

if ($PullImage) {
    docker pull $image
}

$container = 'forgekeeper-vllm-core'

# Determine model argument; if model path is under ./models, map to /models inside container
$model = $env:VLLM_MODEL_CORE
if (-not $model) { Write-Error 'VLLM_MODEL_CORE must be set in .env'; exit 1 }

$hostModels = Join-Path $rootDir 'models'
if (Test-Path $hostModels -PathType Container -and ($model -match '^(\.?/)?models')) {
    $rel = $model -replace '^(\.?/)?models[\\/]*',''
    $modelArg = "/models/$rel"
    $volume = "$hostModels:/models"
} else {
    $modelArg = $model
    $volume = $null
}

# Create or start container
$existing = docker ps -aq -f name=^$container$
if ($existing) {
    $running = docker ps -q -f name=^$container$
    if ($running) {
        Write-Host "vLLM container '$container' already running."
        exit 0
    } else {
        docker start $container | Out-Null
        Write-Host "✅ Started existing vLLM container '$container'."
        exit 0
    }
}

$args = @(
    'run','-d','--name', $container,
    '--gpus','all',
    '-p', "$port:8000"
)
if ($volume) { $args += @('-v', $volume) }
$args += @(
    $image,
    '--model', $modelArg,
    '--max-model-len', ($env:VLLM_MAX_MODEL_LEN ?? '4096'),
    '--tensor-parallel-size', ($env:VLLM_TP ?? '1'),
    '--gpu-memory-utilization', ($env:VLLM_GPU_MEMORY_UTILIZATION ?? '0.9')
)

docker @args | Out-Null
Write-Host "✅ Launched vLLM container '$container' on http://localhost:$port"

