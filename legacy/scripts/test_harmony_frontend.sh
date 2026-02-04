#!/usr/bin/env bash
set -euo pipefail

FE=${FE:-http://localhost:5173}
CORE=${CORE:-http://localhost:8001}

echo '== Frontend config =='
curl -s "$FE/config.json" | jq .

echo
echo '== Frontend Harmony debug (Say exactly: Hello.) =='
curl -s "$FE/api/harmony/debug" -H 'Content-Type: application/json' \
  -d '{"prompt":"Say exactly: Hello."}' | tee /tmp/fh_debug.json | jq . >/dev/null
EXTRACTED=$(jq -r .extracted </tmp/fh_debug.json)
[ -n "$EXTRACTED" ] || { echo 'FAIL: debug.extracted empty'; exit 1; }
echo "$EXTRACTED" | grep -Ev '<\|channel\||<\|start\||<\|end\|' >/dev/null || { echo 'FAIL: extracted has tags'; exit 1; }

echo
echo "== Frontend /api/chat (block) 'Hello!' =="
curl -s "$FE/api/chat" -H 'Content-Type: application/json' \
  -d '{"model":"core","messages":[{"role":"user","content":"Hello!"}],"max_tokens":32}' | tee /tmp/fh_block.json | jq .assistant >/dev/null
ASSIST=$(jq -r .assistant.content </tmp/fh_block.json)
[ -n "$ASSIST" ] || { echo 'FAIL: assistant.content empty'; exit 1; }
echo "$ASSIST" | grep -Ev '<\|channel\||<\|start\||<\|end\||assistantassistant' >/dev/null || { echo 'FAIL: assistant.content has artifacts'; exit 1; }

echo
echo "== Core /v1/completions (minimal Harmony, Hello!) =="
PROMPT='<|start|>system<|message|>
Answer in one short, plain-English sentence. Do not include tags, code, or special symbols.
<|end|>
<|start|>user<|message|>
Hello!
<|end|>
<|start|>assistant<|channel|>final<|message|>'

curl -s "$CORE/v1/completions" -H 'Content-Type: application/json' \
  -d "{\"model\":\"core\",\"prompt\":$(jq -Rn --arg p "$PROMPT" '$p'),\"max_tokens\":24,\"temperature\":0.0,\"stream\":false,\"stop\":[\"<|end|>\",\"<|channel|>\",\"<|return|>\"]}" \
  | tee /tmp/core_compl.json | jq .choices[0].text >/dev/null
CTEXT=$(jq -r .choices[0].text </tmp/core_compl.json)
[ -n "$CTEXT" ] || { echo 'FAIL: core.completions.text empty'; exit 1; }
echo "$CTEXT" | grep -Ev '<\|channel\||<\|start\||<\|end\|' >/dev/null || { echo 'FAIL: core text has tags'; exit 1; }

echo
echo 'All checks passed.'
