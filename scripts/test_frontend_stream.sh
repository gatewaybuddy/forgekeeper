#!/usr/bin/env bash
set -euo pipefail

FE=${FE:-http://localhost:3000}
MODEL=${MODEL:-core}
PROMPT=${PROMPT:-Hello!}
MAXTOK=${MAXTOK:-128}

json_post() {
  local url=$1; shift
  curl -sS "$url" -H 'Content-Type: application/json' -d "$1"
}

echo '== /api/chat (block) =='
BLOCK=$(json_post "$FE/api/chat" "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":$(jq -Rn --arg p "$PROMPT" '$p')}],\"max_tokens\":$MAXTOK,\"auto_tokens\":true}")
echo "$BLOCK" | jq .assistant >/dev/null
ASSIST=$(echo "$BLOCK" | jq -r .assistant.content)
[ -n "$ASSIST" ] || { echo 'FAIL: assistant.content empty'; exit 1; }

echo '== /api/chat/stream (SSE) =='
ACC_R=""
ACC_C=""
FINAL_C=""
FINAL_R=""
EVENT=""
curl -sS -N "$FE/api/chat/stream" -H 'Accept: text/event-stream' -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":$(jq -Rn --arg p "$PROMPT" '$p')}],\"max_tokens\":$MAXTOK,\"auto_tokens\":true}" \
  | while IFS= read -r line; do
      [ -z "$line" ] && continue
      if [[ "$line" == event:* ]]; then EVENT=${line#event: }; continue; fi
      [[ "$line" != data:* ]] && continue
      data=${line#data: }
      if [[ "$data" == "[DONE]" ]]; then break; fi
      if echo "$data" | jq .choices >/dev/null 2>&1; then
        r=$(echo "$data" | jq -r '.choices[0].delta.reasoning_content // empty')
        c=$(echo "$data" | jq -r '.choices[0].delta.content // empty')
        [[ -n "$r" ]] && ACC_R+="$r"
        [[ -n "$c" ]] && ACC_C+="$c"
      else
        # final safety
        rc=$(echo "$data" | jq -r '.reasoning // empty' 2>/dev/null || true)
        cc=$(echo "$data" | jq -r '.content // empty' 2>/dev/null || true)
        [[ -n "$rc" ]] && FINAL_R="$rc"
        [[ -n "$cc" ]] && FINAL_C="$cc"
      fi
    done

COMBINED="$ACC_C"
[[ -z "$COMBINED" && -n "$FINAL_C" ]] && COMBINED="$FINAL_C"
[ -n "$COMBINED" ] || { echo 'FAIL: stream produced no content'; exit 1; }
if echo "$COMBINED" | grep -E '\{[^}]*analysis\s*:' >/dev/null; then
  echo 'FAIL: content contains analysis JSON artifact'
  echo "$COMBINED"
  exit 1
fi
WECOUNT=$(grep -o '\bWe\b' <<< "$COMBINED" | wc -l | tr -d ' ')
if [ "$WECOUNT" -ge 6 ]; then echo "WARN: High 'We' repetition ($WECOUNT)"; fi
echo "stream.final content bytes: ${#COMBINED}, reasoning bytes: ${#ACC_R}"
echo 'All stream smoke checks passed.'

