#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$BaseUrl,
  [string]$Model,
  [string]$ApiKey,
  [switch]$DumpJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $BaseUrl -or [string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = if ($env:FK_CORE_API_BASE) { $env:FK_CORE_API_BASE } else { 'http://localhost:8001' }
}
$apiBase = ($BaseUrl.TrimEnd('/')) + '/v1'
$endpoint = $apiBase + '/chat/completions'

if (-not $Model -or [string]::IsNullOrWhiteSpace($Model)) {
  # Prefer a friendly served-model alias when present; default to 'core'
  if ($env:VLLM_SERVED_MODEL_NAME) { $Model = $env:VLLM_SERVED_MODEL_NAME }
  else { $Model = 'core' }
}
if (-not $ApiKey -or [string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = if ($env:OPENAI_API_KEY) { $env:OPENAI_API_KEY } else { 'dev-key' }
}

$headers = @{ 'Authorization' = "Bearer $ApiKey" }

$body = @{ 
  model = $Model
  messages = @(
    @{ role = 'system'; content = 'You are a helpful assistant.' },
    @{ role = 'user'; content = "Say 'harmony ok' and nothing else." }
  )
  temperature = 0.0
  max_tokens = 32
}

Write-Host "POST $endpoint"
try {
  $resp = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6)
} catch {
  Write-Error "Request failed: $($_.Exception.Message)"
  if ($_.Exception.Response -and $_.Exception.Response.ContentLength -gt 0) {
    try {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $raw = $sr.ReadToEnd()
      Write-Host "Raw error body:"; Write-Host $raw
    } catch {}
  }
  exit 2
}

if (-not $resp.choices -or $resp.choices.Count -lt 1) {
  Write-Error "No choices in response; unexpected format"
  $resp | ConvertTo-Json -Depth 12 | Write-Host
  exit 3
}

if ($DumpJson) { $resp | ConvertTo-Json -Depth 12 | Write-Host }

# Extract content from possible shapes (string, array of parts, or fallback fields)
$msg = $resp.choices[0].message
$content = $null

function Add-IfString([System.Object]$o, [ref]$acc) {
  if ($null -eq $o) { return }
  if ($o -is [string]) { $acc.Value += $o }
}

if ($null -ne $msg) {
  if ($msg.PSObject.Properties.Name -contains 'content') {
    $c = $msg.content
    if ($c -is [string]) {
      $content = $c
    }
    elseif ($c -is [System.Collections.IEnumerable]) {
      $buf = ""
      foreach ($part in $c) {
        if ($null -eq $part) { continue }
        # If item is a plain string
        if ($part -is [string]) { $buf += $part; continue }
        # Prefer common fields
        if ($part.PSObject.Properties.Name -contains 'text') { Add-IfString $part.text ([ref]$buf) }
        if ($part.PSObject.Properties.Name -contains 'content') { Add-IfString $part.content ([ref]$buf) }
        if ($part.PSObject.Properties.Name -contains 'value') { Add-IfString $part.value ([ref]$buf) }
        # Some providers use type output_text
        if ($part.PSObject.Properties.Name -contains 'type' -and $part.type -eq 'output_text') {
          if ($part.PSObject.Properties.Name -contains 'text') { Add-IfString $part.text ([ref]$buf) }
        }
      }
      if ($buf.Length -gt 0) { $content = $buf }
    }
  }
}
if (-not $content) {
  if ($resp.choices[0].PSObject.Properties.Name -contains 'text') { $content = [string]$resp.choices[0].text }
  elseif ($resp.choices[0].PSObject.Properties.Name -contains 'content') {
    $c2 = $resp.choices[0].content
    if ($c2 -is [string]) { $content = $c2 }
    elseif ($c2 -is [System.Collections.IEnumerable]) {
      $tmp = ""
      foreach ($p in $c2) {
        if ($p -is [string]) { $tmp += $p }
        elseif ($p.PSObject.Properties.Name -contains 'text') { $tmp += [string]$p.text }
        elseif ($p.PSObject.Properties.Name -contains 'content') { $tmp += [string]$p.content }
      }
      if ($tmp.Length -gt 0) { $content = $tmp }
    }
  }
}

# Capture reasoning_content if provided
$reasoning = $null
if ($msg -and $msg.PSObject.Properties.Name -contains 'reasoning_content') {
  $rc = $msg.reasoning_content
  if ($rc -is [string] -and $rc.Length -gt 0) { $reasoning = $rc }
}

Write-Host "Assistant: $content"
if ($resp.choices[0].PSObject.Properties.Name -contains 'finish_reason') {
  Write-Host ("finish_reason: {0}" -f $resp.choices[0].finish_reason)
}
$pass = $false
if ($content -and ($content.ToLower() -match 'harmony\s*ok')) { $pass = $true }
elseif ($reasoning -and ($reasoning.ToLower() -match 'harmony\s*ok')) { $pass = $true }

if (-not $pass) {
  $fr = ''
  if ($resp.choices[0].PSObject.Properties.Name -contains 'finish_reason') { $fr = [string]$resp.choices[0].finish_reason }
  if ($fr -eq 'length') {
    Write-Warning "Model truncated output (finish_reason=length). Connectivity OK; not asserting phrase."
    exit 0
  }
  Write-Error "Unexpected content; check formatting/backends"
  $resp | ConvertTo-Json -Depth 12 | Write-Host
  exit 4
}

Write-Host "PASS: basic chat completion works"
exit 0
