#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$Frontend = 'http://localhost:3000',
  [string]$Model = 'core',
  [string]$Prompt = 'Hello!',
  [int]$MaxTokens = 128,
  [switch]$VerboseLog
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-JsonPost([string]$Url, [hashtable]$Body) {
  $json = $Body | ConvertTo-Json -Depth 10 -Compress
  return Invoke-RestMethod -Method Post -Uri $Url -ContentType 'application/json' -Body $json
}

function Test-Block() {
  Write-Host "== /api/chat (block) =="
  $res = Invoke-JsonPost ("$Frontend/api/chat") @{ model=$Model; messages=@(@{role='user'; content=$Prompt}); max_tokens=$MaxTokens; auto_tokens=$true }
  $assistant = $res.assistant
  if (-not $assistant) { throw 'FAIL: no assistant in response' }
  $content = [string]$assistant.content
  if (-not $content -or $content.Trim().Length -lt 1) { throw 'FAIL: assistant.content empty' }
  if ($VerboseLog) { Write-Host "block.content: $content" }
  if ($assistant.PSObject.Properties['reasoning'] -and $assistant.reasoning) {
    $r = [string]$assistant.reasoning
    if ($VerboseLog) { Write-Host "block.reasoning: $r" }
  }
}

function Test-Stream() {
  Write-Host "== /api/chat/stream (SSE) =="
  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromMinutes(2)
  $req = New-Object System.Net.Http.HttpRequestMessage 'POST', ("$Frontend/api/chat/stream")
  $payload = @{ model=$Model; messages=@(@{role='user'; content=$Prompt}); max_tokens=$MaxTokens; auto_tokens=$true }
  $req.Headers.Add('Accept','text/event-stream')
  $req.Content = New-Object System.Net.Http.StringContent(($payload | ConvertTo-Json -Depth 10 -Compress), [System.Text.Encoding]::UTF8, 'application/json')
  $resp = $client.Send($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead)
  if (-not $resp.IsSuccessStatusCode) { throw "FAIL: HTTP $($resp.StatusCode) from stream endpoint" }
  $stream = $resp.Content.ReadAsStream()
  $sr = New-Object System.IO.StreamReader($stream)
  $accR = ''
  $accC = ''
  $finalEvent = $false
  $finalC = ''
  $finalR = ''
  $evt = ''
  while (-not $sr.EndOfStream) {
    $line = $sr.ReadLine()
    if (-not $line) { continue }
    if ($line.StartsWith('event:')) { $evt = $line.Substring(6).Trim(); if ($VerboseLog) { Write-Host "event: $evt" }; continue }
    if (-not $line.StartsWith('data:')) { continue }
    $data = $line.Substring(5).Trim()
    if ($data -eq '[DONE]') { break }
    try {
      $obj = $data | ConvertFrom-Json -Depth 12
    } catch { if ($VerboseLog) { Write-Warning "non-JSON data: $data" }; continue }
    # Skip orchestration/debug payloads that don't carry deltas
    if ($evt -eq 'fk-orchestration') { continue }
    # Choices delta chunk
    $hasChoices = $false
    try { $hasChoices = $null -ne $obj.PSObject.Properties['choices'] } catch {}
    if ($hasChoices) {
      $delta = $obj.choices[0].delta
      $r = ''
      $c = ''
      if ($null -ne $delta) {
        $rp = $delta.PSObject.Properties['reasoning_content']
        if ($null -ne $rp -and $null -ne $rp.Value) { $r = [string]$rp.Value }
        $cp = $delta.PSObject.Properties['content']
        if ($null -ne $cp -and $null -ne $cp.Value) { $c = [string]$cp.Value }
      }
      if ($r) { $accR += $r; if ($VerboseLog) { Write-Host "[r] $r" } }
      if ($c) { $accC += $c; if ($VerboseLog) { Write-Host "[c] $c" } }
      continue
    }
    # fk-final safety
    $fp = $obj.PSObject.Properties['content']
    if ($null -ne $fp) { $finalEvent = $true; $finalC = [string]$obj.content }
    $frp = $obj.PSObject.Properties['reasoning']
    if ($null -ne $frp) { $finalR = [string]$obj.reasoning }
  }
  if (-not $accC -and -not $finalC) { throw 'FAIL: stream produced no content' }
  # Basic artifact checks
  $combined = if ($accC) { $accC } else { $finalC }
  if ($combined -match '\{[^}]*analysis\s*:') { throw "FAIL: content contains analysis JSON artifact: $combined" }
  # repetition heuristic for 'We' prefix
  $weCount = ([regex]::Matches($combined, '(?m)\bWe\b')).Count
  if ($weCount -ge 6) { Write-Warning "High 'We' repetition ($weCount)." }
  Write-Host ("stream.final content bytes: {0}, reasoning bytes: {1}" -f $combined.Length, $accR.Length)
  if ($VerboseLog) {
    if ($accR) { Write-Host "reasoning: $accR" }
    Write-Host "final: $combined"
  }
}

try {
  Test-Block
  Test-Stream
  Write-Host 'All stream smoke checks passed.'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

exit 0
