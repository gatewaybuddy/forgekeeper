${function:Invoke-JsonPost} = {
  param($Url, $Body)
  $json = $Body | ConvertTo-Json -Depth 10 -Compress
  Invoke-RestMethod -Uri $Url -Method Post -ContentType 'application/json' -Body $json
}

${function:Assert-NonEmpty} = {
  param([string]$label, [string]$text)
  if (-not $text -or $text.Trim().Length -lt 1) { throw "FAIL: $label is empty" }
}

${function:Assert-Clean} = {
  param([string]$label, [string]$text)
  $bad = @('<|channel|>','<|start|>','<|end|>','assistantassistant')
  foreach ($b in $bad) { if ($text -match [Regex]::Escape($b)) { throw "FAIL: $label contains artifact: $b`n$text" } }
}

$ErrorActionPreference = 'Stop'
$fe = 'http://localhost:5173'
$core = 'http://localhost:8001'

Write-Host '== Frontend config =='
$cfg = Invoke-RestMethod -Uri "$fe/config.json" -Method Get
$cfg | ConvertTo-Json -Depth 6 | Write-Output
if (-not $cfg.useHarmony) { throw 'FAIL: useHarmony=false; expected true for GPT-OSS' }

Write-Host "`n== Frontend Harmony debug (Say exactly: Hello.) =="
$dbg = Invoke-JsonPost "$fe/api/harmony/debug" @{ prompt = 'Say exactly: Hello.' }
$dbg | ConvertTo-Json -Depth 5 | Write-Output
Assert-NonEmpty 'debug.extracted' ($dbg.extracted)
Assert-Clean 'debug.extracted' ($dbg.extracted)

Write-Host "`n== Frontend /api/chat (block) 'Hello!' =="
$block = Invoke-JsonPost "$fe/api/chat" @{ model='core'; messages=@(@{role='user'; content='Hello!' }); max_tokens=32 }
$block.assistant | ConvertTo-Json -Depth 5 | Write-Output
Assert-NonEmpty 'block.assistant.content' ($block.assistant.content)
Assert-Clean 'block.assistant.content' ($block.assistant.content)

Write-Host "`n== Core /v1/completions (minimal Harmony, Hello!) =="
$prompt = "<|start|>system<|message|>`nAnswer in one short, plain-English sentence. Do not include tags, code, or special symbols.`n<|end|>`n<|start|>user<|message|>`nHello!`n<|end|>`n<|start|>assistant<|channel|>final<|message|>";
$coreResp = Invoke-JsonPost "$core/v1/completions" @{ model='core'; prompt=$prompt; max_tokens=24; temperature=0.0; stream=$false; stop=@('<|end|>','<|channel|>','<|return|>') }
$coreText = $coreResp.choices[0].text
Write-Output ($coreText)
Assert-NonEmpty 'core.completions.text' $coreText
Assert-Clean 'core.completions.text' $coreText

Write-Host "`nAll checks passed."
