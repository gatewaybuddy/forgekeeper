#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$Prompt,
  [string]$BaseUrl,
  [string]$Model,
  [string]$ApiKey,
  [string]$System = 'You are a helpful assistant.',
  [double]$Temperature = 0.2,
  [int]$MaxTokens = 256,
  [switch]$NoStream,
  [int]$WaitSeconds = 600,
  [string]$Container = 'forgekeeper-vllm-core-1',
  [switch]$AutoWait
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Prompt) {
  Write-Host 'Enter your prompt (end with Ctrl+Z then Enter on Windows, or Ctrl+D on *nix):'
  $Prompt = [Console]::In.ReadToEnd()
  $Prompt = $Prompt.Trim()
}
if (-not $Prompt) { Write-Error 'No prompt provided.'; exit 1 }

if (-not $BaseUrl -or [string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = if ($env:FK_CORE_API_BASE) { $env:FK_CORE_API_BASE } else { 'http://localhost:8001' }
}
$apiBase = ($BaseUrl.TrimEnd('/')) + '/v1'
$endpoint = $apiBase + '/chat/completions'

if (-not $Model -or [string]::IsNullOrWhiteSpace($Model)) {
  $Model = if ($env:VLLM_SERVED_MODEL_NAME) { $env:VLLM_SERVED_MODEL_NAME } else { 'core' }
}
if (-not $ApiKey -or [string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = if ($env:OPENAI_API_KEY) { $env:OPENAI_API_KEY } else { 'dev-key' }
}

$headers = @{ 'Authorization' = "Bearer $ApiKey" }
$body = @{ 
  model = $Model
  messages = @(
    @{ role = 'system'; content = $System },
    @{ role = 'user'; content = $Prompt }
  )
  temperature = $Temperature
  max_tokens = $MaxTokens
}

function Test-Health([string]$base) {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri ($base.TrimEnd('/') + '/healthz'); if ($r.StatusCode -eq 200) { return $true } } catch {}
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri ($base.TrimEnd('/') + '/health'); if ($r.StatusCode -eq 200) { return $true } } catch {}
  return $false
}

function Tail-Logs([string]$container, [int]$lines=8) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return }
  try { docker logs --tail $lines $container 2>$null | Out-String } catch { return }
}

function Wait-For-Health([string]$base, [int]$timeoutSec, [string]$container) {
  Write-Host "⏳ vLLM Core: waiting for health (up to $timeoutSec s). It may still be loading the model..."
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $lastPrint = (Get-Date).AddSeconds(-99)
  do {
    if (Test-Health $base) { return $true }
    $now = Get-Date
    if (($now - $lastPrint).TotalSeconds -ge 5) {
      $snippet = Tail-Logs $container 6
      if ($snippet) { Write-Host "--- vLLM recent logs ---`n$snippet`n------------------------" }
      $lastPrint = $now
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  return (Test-Health $base)
}

function Invoke-Blocking {
  param([hashtable]$Headers, [hashtable]$Body)
  $resp = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $Headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 6)
  $msg = $resp.choices[0].message
  $reasoning = $null
  $final = $null
  if ($msg.PSObject.Properties.Name -contains 'reasoning_content') { $reasoning = [string]$msg.reasoning_content }
  if ($msg.PSObject.Properties.Name -contains 'content') {
    $c = $msg.content
    if ($c -is [string]) { $final = $c }
    elseif ($c -is [System.Collections.IEnumerable]) {
      $tmp = ""; foreach ($p in $c) { if ($p -is [string]) { $tmp += $p } elseif ($p.PSObject.Properties.Name -contains 'text') { $tmp += [string]$p.text } elseif ($p.PSObject.Properties.Name -contains 'content') { $tmp += [string]$p.content } }
      if ($tmp) { $final = $tmp }
    }
  }
  if ($reasoning) { Write-Host "[reasoning] $reasoning" }
  if ($final) { Write-Host "[final] $final" }
}

function Invoke-Stream {
  param([hashtable]$Headers, [hashtable]$Body)
  $Body.stream = $true

  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromMinutes(30)
  $req = New-Object System.Net.Http.HttpRequestMessage 'POST', $endpoint
  $req.Headers.Add('Authorization', "Bearer $ApiKey")
  $req.Headers.Add('Accept', 'text/event-stream')
  $json = ($Body | ConvertTo-Json -Depth 6)
  $req.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
  $resp = $client.Send($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead)
  $stream = $resp.Content.ReadAsStream()
  $sr = New-Object System.IO.StreamReader($stream)

  $accReasoning = ''
  $accFinal = ''
  $buf = ''
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $lastFlushMs = 0
  $flushIntervalMs = 300
  $flushThreshold = 80
  while (-not $sr.EndOfStream) {
    $line = $sr.ReadLine()
    if (-not $line) { continue }
    if ($line -like 'data: *') {
      $payload = $line.Substring(6).Trim()
      if ($payload -eq '[DONE]') { break }
      try { $obj = $payload | ConvertFrom-Json -Depth 6 } catch { continue }
      if (-not $obj.choices -or $obj.choices.Count -lt 1) { continue }
      $delta = $obj.choices[0].delta
      if ($null -eq $delta) { continue }
      if ($delta.PSObject.Properties.Name -contains 'reasoning_content' -and $delta.reasoning_content) {
        $accReasoning += [string]$delta.reasoning_content
        $buf += [string]$delta.reasoning_content
      }
      if ($delta.PSObject.Properties.Name -contains 'content' -and $delta.content) {
        $accFinal += [string]$delta.content
      }
      $nowMs = $sw.ElapsedMilliseconds
      if ($buf.Length -ge $flushThreshold -or ($nowMs - $lastFlushMs) -ge $flushIntervalMs) {
        if ($buf.Length -gt 0) { Write-Host "[r] $buf"; $buf = '' }
        $lastFlushMs = $nowMs
      }
    }
  }
  if ($buf.Length -gt 0) { Write-Host "[r] $buf" }
  if ($accReasoning) { Write-Host "[reasoning] $accReasoning" }
  if ($accFinal) { Write-Host "[final] $accFinal" }
}

try {
  if ($AutoWait -and -not (Test-Health $BaseUrl)) {
    [void](Wait-For-Health -base $BaseUrl -timeoutSec $WaitSeconds -container $Container)
  }
  if ($NoStream) { Invoke-Blocking -Headers $headers -Body $body }
  else { Invoke-Stream -Headers $headers -Body $body }
} catch {
  Write-Warning "Request failed: $($_.Exception.Message)"
  Write-Host "Attempting health check and retry..."
  $ok = Wait-For-Health -base $BaseUrl -timeoutSec $WaitSeconds -container $Container
  if (-not $ok) {
    Write-Error "vLLM Core did not become healthy in time. Please try again shortly."
    exit 2
  }
  try {
    if ($NoStream) { Invoke-Blocking -Headers $headers -Body $body }
    else { Invoke-Stream -Headers $headers -Body $body }
  } catch {
    Write-Error "Retry failed: $($_.Exception.Message)"
    exit 3
  }
}

exit 0
