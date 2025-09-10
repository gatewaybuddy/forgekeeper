#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Alias('h','?')][switch]$Help,
    [switch]$Detach,
    [string]$LogDir,
    [switch]$CliOnly,
    [switch]$RequireVLLM,
    [int]$VLLMWaitSeconds = 90,
    [switch]$RequireBackend,
    [int]$BackendWaitSeconds = 60
)

Set-StrictMode -Version Latest

function Show-Usage {
@"
Usage: pwsh ./start.ps1 [options]

Starts the Forgekeeper local stack (GraphQL backend, Python agent, Vite frontend).
Automatically ensures MongoDB is running and launches vLLM if needed.

Options:
  -Detach            Start services detached/minimized and return immediately.
  -ResetPrefs        Delete saved start preferences and re-prompt.
  -LogDir <path>     Directory for logs when using -Detach (auto-generated if omitted).
  -Verbose           Print extra diagnostics and set DEBUG_MODE=true.
  -CliOnly           Start only the Python agent (no backend/frontend).
  -RequireVLLM       Wait for vLLM health; abort if not healthy in time.
  -VLLMWaitSeconds   Seconds to wait for vLLM when -RequireVLLM (default 90).
  -RequireBackend    Wait for backend health; abort if not healthy in time.
  -BackendWaitSeconds Seconds to wait for backend when -RequireBackend (default 60).
  -Help, -h, -?      Show this help message and exit.

Examples:
  pwsh ./start.ps1
  pwsh ./start.ps1 -Detach
  pwsh ./start.ps1 -Detach -LogDir ./logs/run-1
"@
}

if ($Help) { Show-Usage; exit 0 }

# Root-level wrapper to start the local stack
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$target = Join-Path $scriptDir 'scripts/start_local_stack.ps1'

if (-not (Test-Path $target)) {
    Write-Error "Could not find start script at $target"
    exit 1
}

# Forward recognized parameters to the underlying script using splatting
$splat = @{}
if ($PSBoundParameters.ContainsKey('Detach')) { $splat.Detach = $true }
if ($PSBoundParameters.ContainsKey('LogDir') -and $LogDir) { $splat.LogDir = $LogDir }
if ($PSBoundParameters.ContainsKey('ResetPrefs')) { $splat.ResetPrefs = $true }
if ($PSBoundParameters.ContainsKey('RequireVLLM')) { $splat.RequireVLLM = $true }
if ($PSBoundParameters.ContainsKey('VLLMWaitSeconds')) { $splat.VLLMWaitSeconds = [int]$VLLMWaitSeconds }
if ($PSBoundParameters.ContainsKey('RequireBackend')) { $splat.RequireBackend = $true }
if ($PSBoundParameters.ContainsKey('BackendWaitSeconds')) { $splat.BackendWaitSeconds = [int]$BackendWaitSeconds }
if ($PSBoundParameters.ContainsKey('Verbose')) { $splat.Verbose = $true }
if ($PSBoundParameters.ContainsKey('CliOnly')) { $splat.CliOnly = $true }

& $target @splat

