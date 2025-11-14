#!/bin/bash
# Test Thought World Backend Integration

echo "Testing /api/chat/thought-world endpoint..."
echo ""

# Start frontend server in background (if not already running)
echo "Checking if frontend server is running..."
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "Frontend server not running. Please start it first:"
  echo "  cd frontend && npm run dev"
  exit 1
fi

echo "✅ Frontend server is running"
echo ""

# Test request
echo "Sending test request to thought-world endpoint..."
echo "Task: Create a simple function that adds two numbers"
echo ""

curl -X POST http://localhost:3000/api/chat/thought-world \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Create a simple function that adds two numbers with error handling"
      }
    ],
    "model": "core"
  }' \
  | jq '.'

echo ""
echo "Check .forgekeeper/thought_world/memory/episodes.jsonl for logged episode"
