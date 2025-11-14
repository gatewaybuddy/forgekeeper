#!/bin/bash
# Start Forgekeeper with Frontend + Inference

set -e

echo "🚀 Starting Forgekeeper Stack..."
echo ""

# Ensure network exists
if ! docker network inspect forgekeeper-net >/dev/null 2>&1; then
  echo "Creating forgekeeper-net network..."
  docker network create forgekeeper-net
fi

# Build frontend (includes thought-world integration)
echo "📦 Building frontend container..."
docker compose build frontend

# Start services
echo "🏃 Starting services..."
docker compose --profile ui --profile inference up -d

echo ""
echo "✅ Services started!"
echo ""
echo "Services:"
echo "  🔨 Inference (llama-core): http://localhost:8001"
echo "  🌐 Frontend (Express): http://localhost:3000"
echo "  📊 Test Page: http://localhost:3000/test-thought-world.html"
echo ""
echo "Logs:"
echo "  docker compose logs -f frontend"
echo "  docker compose logs -f llama-core"
echo ""
echo "Stop:"
echo "  docker compose --profile ui --profile inference down"
