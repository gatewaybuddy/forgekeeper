#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$Message,
  [string]$Branch,
  [switch]$Rebase,
  [switch]$Amend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $repoRoot

function Exec($args) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $args[0]
  $psi.Arguments = [string]::Join(' ', $args[1..($args.Count-1)])
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $out = $p.StandardOutput.ReadToEnd()
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  return @{ Code = $p.ExitCode; Out = $out.Trim(); Err = $err.Trim() }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error 'git is required.'
  exit 1
}

$curBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if ([string]::IsNullOrWhiteSpace($curBranch)) { Write-Error 'Not in a git repo.'; exit 1 }

if ($Branch -and $Branch -ne $curBranch) {
  $exists = (git branch --list $Branch).Trim()
  if ($exists) { git checkout $Branch | Out-Null }
  else { git checkout -b $Branch | Out-Null }
  $curBranch = $Branch
}

# Stage all changes
git add -A

# Check if anything is staged
git diff --cached --quiet
$hasStaged = $LASTEXITCODE -ne 0

if (-not $hasStaged -and -not $Amend) {
  Write-Host 'No changes to commit.'
} else {
  if (-not $Message -and -not $Amend) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $Message = "chore(local): workspace sync $ts"
  }

  if ($Amend) {
    if ($Message) { git commit --amend -m $Message | Out-Null }
    else { git commit --amend --no-edit | Out-Null }
  } else {
    git commit -m $Message | Out-Null
  }
}

if ($Rebase) {
  git fetch --all --prune | Out-Null
  # Only rebase if remote branch exists; otherwise try to rebase onto origin/main
  $remoteHead = (git ls-remote --heads origin $curBranch).Trim()
  if ($remoteHead) {
    git pull --rebase --autostash | Out-Null
  } else {
    $hasMain = (git ls-remote --heads origin main).Trim()
    if ($hasMain) { git rebase origin/main | Out-Null }
  }
}

# Push (create upstream if missing)
$remoteHead2 = (git ls-remote --heads origin $curBranch).Trim()
if ($remoteHead2) {
  git push origin $curBranch
} else {
  git push -u origin $curBranch
}

Write-Host ("Pushed branch '{0}' to origin." -f $curBranch)

