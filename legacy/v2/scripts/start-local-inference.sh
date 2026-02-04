#!/bin/bash
#
# Start local inference server (llama.cpp + Qwen3-Coder)
# Optimized for RTX 5090
#

set -e

# Configuration
LLAMA_DIR="${LLAMA_DIR:-$HOME/.forgekeeper/llama.cpp}"
MODEL_PATH="${MODEL_PATH:-$HOME/.forgekeeper/models/qwen3-coder-32b-instruct-q5_k_m.gguf}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
CONTEXT_SIZE="${CONTEXT_SIZE:-32768}"
GPU_LAYERS="${GPU_LAYERS:-99}"
THREADS="${THREADS:-8}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Find llama-server binary
find_binary() {
    BINARY=""

    # Check common locations
    for path in \
        "$LLAMA_DIR/build/bin/llama-server" \
        "$LLAMA_DIR/build/bin/Release/llama-server" \
        "$LLAMA_DIR/llama-server" \
        "/usr/local/bin/llama-server"
    do
        if [ -f "$path" ]; then
            BINARY="$path"
            break
        fi
    done

    if [ -z "$BINARY" ]; then
        error "llama-server binary not found. Please run ./scripts/setup-llama.sh first"
    fi

    info "Found llama-server: $BINARY"
}

# Check model file
check_model() {
    if [ ! -f "$MODEL_PATH" ]; then
        error "Model not found: $MODEL_PATH\nPlease run ./scripts/download-qwen.sh first"
    fi

    FILE_SIZE=$(stat -f%z "$MODEL_PATH" 2>/dev/null || stat -c%s "$MODEL_PATH" 2>/dev/null || echo "0")
    FILE_SIZE_GB=$((FILE_SIZE / 1024 / 1024 / 1024))

    info "Model file: $MODEL_PATH (${FILE_SIZE_GB}GB)"
}

# Check GPU availability
check_gpu() {
    if command -v nvidia-smi &> /dev/null; then
        GPU_COUNT=$(nvidia-smi --list-gpus | wc -l)
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
        GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)

        info "Found GPU: $GPU_NAME (${GPU_MEM}MB VRAM, ${GPU_COUNT} device(s))"

        # Check VRAM
        if [ "$GPU_MEM" -lt 24000 ]; then
            warn "GPU has less than 24GB VRAM. Model may not fit entirely in GPU memory."
            warn "Consider using a smaller quantization (Q4_K_M) or reducing GPU layers."
        fi
    else
        warn "nvidia-smi not found. Cannot detect GPU."
        warn "If you have a GPU, make sure NVIDIA drivers are installed."
    fi
}

# Check port availability
check_port() {
    if command -v lsof &> /dev/null; then
        if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
            error "Port $PORT is already in use. Please stop the existing server or use a different port."
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tuln | grep ":$PORT " >/dev/null 2>&1; then
            error "Port $PORT is already in use. Please stop the existing server or use a different port."
        fi
    else
        warn "Cannot check port availability (lsof/netstat not found)"
    fi

    info "Port $PORT is available"
}

# Print configuration
print_config() {
    echo ""
    info "Starting llama-server with the following configuration:"
    echo ""
    echo "  Model:        $MODEL_PATH"
    echo "  Host:         $HOST"
    echo "  Port:         $PORT"
    echo "  Context Size: $CONTEXT_SIZE tokens"
    echo "  GPU Layers:   $GPU_LAYERS"
    echo "  Threads:      $THREADS"
    echo "  Flash Attn:   Enabled"
    echo "  Batch Mode:   Continuous batching (parallel=4)"
    echo ""
    echo "Server will be available at: http://$HOST:$PORT"
    echo "  Health check: http://$HOST:$PORT/health"
    echo "  API endpoint: http://$HOST:$PORT/v1/chat/completions"
    echo ""
}

# Start server
start_server() {
    info "Starting server..."
    echo ""

    # Build command
    CMD=(
        "$BINARY"
        -m "$MODEL_PATH"
        --host "$HOST"
        --port "$PORT"
        -c "$CONTEXT_SIZE"
        -ngl "$GPU_LAYERS"
        -t "$THREADS"
        --flash-attn
        --no-mmap
        --cont-batching
        --parallel 4
        --metrics
    )

    # Add extra arguments from command line
    CMD+=("$@")

    # Execute
    exec "${CMD[@]}"
}

# Main execution
main() {
    info "Forgekeeper v2 - Local Inference Server"
    echo ""

    find_binary
    check_model
    check_gpu
    check_port
    print_config
    start_server "$@"
}

main "$@"
