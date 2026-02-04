#!/bin/bash
#
# T22: Rate Limit Smoke Test
#
# Tests that the token bucket rate limiter correctly throttles requests
# by sending rapid requests until we get at least one 429 response.
#
# Usage:
#   bash frontend/test-t22-ratelimit.sh
#
# Expected outcome:
#   - First N requests succeed (up to bucket capacity)
#   - Subsequent rapid requests return 429 with Retry-After header
#   - Metrics endpoint shows rate limit hits

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
ENDPOINT="${ENDPOINT:-/api/chat}"
TOTAL_REQUESTS="${TOTAL_REQUESTS:-150}"  # More than default capacity (100)
DELAY="${DELAY:-0.01}"  # 10ms between requests for rapid fire

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "T22: Rate Limit Smoke Test"
echo "========================================"
echo ""
echo "Configuration:"
echo "  API URL: ${API_URL}"
echo "  Endpoint: ${ENDPOINT}"
echo "  Total Requests: ${TOTAL_REQUESTS}"
echo "  Delay: ${DELAY}s"
echo ""

# Test payload
PAYLOAD='{
  "messages": [
    {"role": "user", "content": "test"}
  ],
  "model": "core",
  "max_tokens": 10
}'

# Counters
success_count=0
rate_limit_count=0
error_count=0

echo "Sending ${TOTAL_REQUESTS} requests..."
echo ""

# Send requests in a loop
for i in $(seq 1 $TOTAL_REQUESTS); do
  # Send request and capture HTTP status
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${API_URL}${ENDPOINT}" 2>/dev/null || echo "000")

  # Count responses
  if [ "$http_code" = "200" ]; then
    success_count=$((success_count + 1))
    echo -ne "\r[${i}/${TOTAL_REQUESTS}] 200: ${success_count} | 429: ${rate_limit_count} | Errors: ${error_count}"
  elif [ "$http_code" = "429" ]; then
    rate_limit_count=$((rate_limit_count + 1))
    echo -ne "\r[${i}/${TOTAL_REQUESTS}] 200: ${success_count} | 429: ${rate_limit_count} | Errors: ${error_count}"

    # On first 429, show the full response with Retry-After header
    if [ $rate_limit_count -eq 1 ]; then
      echo ""
      echo ""
      echo "First 429 response detected! Details:"
      response=$(curl -s -i -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "${API_URL}${ENDPOINT}" 2>/dev/null)
      echo "$response" | grep -E "HTTP/|Retry-After|X-RateLimit"
      echo ""
      body=$(echo "$response" | tail -n 1)
      echo "Response body: $body"
      echo ""
    fi
  else
    error_count=$((error_count + 1))
    echo -ne "\r[${i}/${TOTAL_REQUESTS}] 200: ${success_count} | 429: ${rate_limit_count} | Errors: ${error_count} (HTTP ${http_code})"
  fi

  # Small delay between requests
  sleep $DELAY
done

echo ""
echo ""
echo "========================================"
echo "Test Results"
echo "========================================"
echo "  Successful (200): ${success_count}"
echo "  Rate Limited (429): ${rate_limit_count}"
echo "  Errors: ${error_count}"
echo ""

# Check metrics endpoint
echo "Fetching rate limit metrics..."
metrics=$(curl -s "${API_URL}/api/rate-limit/metrics" 2>/dev/null || echo "{}")
echo "$metrics" | jq '.' 2>/dev/null || echo "$metrics"
echo ""

# Verify test passed
echo "========================================"
echo "Validation"
echo "========================================"

if [ $rate_limit_count -gt 0 ]; then
  echo -e "${GREEN}✓ PASS:${NC} Received at least one 429 response ($rate_limit_count total)"
  exit_code=0
else
  echo -e "${RED}✗ FAIL:${NC} No 429 responses received"
  echo "  This indicates rate limiting is not working correctly."
  echo "  Check that RATE_LIMIT_ENABLED=1 and capacity is set appropriately."
  exit_code=1
fi

if [ $success_count -gt 0 ]; then
  echo -e "${GREEN}✓ PASS:${NC} Some requests succeeded ($success_count total)"
else
  echo -e "${YELLOW}⚠ WARN:${NC} No requests succeeded"
fi

echo ""
exit $exit_code
