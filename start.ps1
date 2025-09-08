#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

# Root-level wrapper to start the local stack
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$target = Join-Path $scriptDir 'scripts/start_local_stack.ps1'

& $target @Args

