#!/bin/bash
#
# Setup llama.cpp with CUDA support for RTX 5090
# This script downloads, builds, and configures llama.cpp
#

set -e

# Configuration
LLAMA_DIR="${LLAMA_DIR:-$HOME/.forgekeeper/llama.cpp}"
CUDA_VERSION="${CUDA_VERSION:-12}"
BUILD_TYPE="${BUILD_TYPE:-Release}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."

    # Check for git
    if ! command -v git &> /dev/null; then
        error "git is not installed. Please install git first."
    fi

    # Check for cmake
    if ! command -v cmake &> /dev/null; then
        error "cmake is not installed. Please install cmake first."
    fi

    # Check for CUDA
    if ! command -v nvcc &> /dev/null; then
        warn "CUDA compiler (nvcc) not found. CUDA support will be disabled."
        warn "To enable GPU acceleration, install CUDA Toolkit $CUDA_VERSION."
        return 1
    fi

    # Check CUDA version
    CUDA_VER=$(nvcc --version | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    info "Found CUDA version: $CUDA_VER"

    # Check for cuBLAS
    if [ ! -d "/usr/local/cuda/lib64" ] && [ ! -d "/usr/lib/x86_64-linux-gnu" ]; then
        warn "cuBLAS libraries not found. GPU acceleration may not work."
    fi

    return 0
}

# Clone llama.cpp
clone_llama() {
    info "Cloning llama.cpp repository..."

    if [ -d "$LLAMA_DIR" ]; then
        warn "llama.cpp directory already exists at $LLAMA_DIR"
        read -p "Do you want to remove it and clone fresh? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$LLAMA_DIR"
        else
            info "Using existing directory"
            return 0
        fi
    fi

    mkdir -p "$(dirname "$LLAMA_DIR")"
    git clone https://github.com/ggerganov/llama.cpp "$LLAMA_DIR"
    cd "$LLAMA_DIR"

    # Get latest stable tag
    LATEST_TAG=$(git describe --tags --abbrev=0)
    info "Checking out latest stable version: $LATEST_TAG"
    git checkout "$LATEST_TAG"
}

# Build llama.cpp
build_llama() {
    info "Building llama.cpp with CUDA support..."

    cd "$LLAMA_DIR"

    # Clean previous builds
    if [ -d "build" ]; then
        warn "Removing previous build directory"
        rm -rf build
    fi

    mkdir -p build
    cd build

    # Configure with CMake
    if command -v nvcc &> /dev/null; then
        info "Configuring with CUDA support..."
        cmake .. \
            -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
            -DLLAMA_CUDA=ON \
            -DLLAMA_CUDA_F16=ON \
            -DLLAMA_CUDA_FORCE_MMQ=OFF \
            -DCMAKE_CUDA_ARCHITECTURES=89 \
            || error "CMake configuration failed"
    else
        warn "Building without CUDA support (CPU only)"
        cmake .. \
            -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
            || error "CMake configuration failed"
    fi

    # Build
    info "Compiling llama.cpp (this may take several minutes)..."
    cmake --build . --config "$BUILD_TYPE" -j$(nproc) \
        || error "Build failed"

    info "Build completed successfully!"
}

# Verify installation
verify_installation() {
    info "Verifying installation..."

    cd "$LLAMA_DIR/build"

    if [ -f "bin/llama-server" ] || [ -f "bin/Release/llama-server" ]; then
        info "llama-server binary found"
    else
        error "llama-server binary not found"
    fi

    if [ -f "bin/llama-cli" ] || [ -f "bin/Release/llama-cli" ]; then
        info "llama-cli binary found"
    else
        warn "llama-cli binary not found (optional)"
    fi

    info "Installation verified successfully!"
}

# Create helper scripts
create_helpers() {
    info "Creating helper scripts..."

    # Create start script
    cat > "$LLAMA_DIR/start-server.sh" << 'EOF'
#!/bin/bash
# Start llama-server with optimal settings for RTX 5090

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BINARY="$SCRIPT_DIR/build/bin/llama-server"

if [ ! -f "$BINARY" ]; then
    BINARY="$SCRIPT_DIR/build/bin/Release/llama-server"
fi

if [ ! -f "$BINARY" ]; then
    echo "Error: llama-server binary not found"
    exit 1
fi

# Configuration
MODEL_PATH="${MODEL_PATH:-$HOME/.forgekeeper/models/qwen3-coder-32b-instruct-q5_k_m.gguf}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
CONTEXT_SIZE="${CONTEXT_SIZE:-32768}"
GPU_LAYERS="${GPU_LAYERS:-99}"
THREADS="${THREADS:-8}"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Error: Model not found at $MODEL_PATH"
    echo "Please run download-qwen.sh first"
    exit 1
fi

echo "Starting llama-server..."
echo "Model: $MODEL_PATH"
echo "Host: $HOST:$PORT"
echo "Context: $CONTEXT_SIZE"
echo "GPU Layers: $GPU_LAYERS"

"$BINARY" \
    -m "$MODEL_PATH" \
    --host "$HOST" \
    --port "$PORT" \
    -c "$CONTEXT_SIZE" \
    -ngl "$GPU_LAYERS" \
    -t "$THREADS" \
    --flash-attn \
    --no-mmap \
    --cont-batching \
    --parallel 4 \
    --metrics \
    "$@"
EOF

    chmod +x "$LLAMA_DIR/start-server.sh"
    info "Created start-server.sh"

    # Create symlink in PATH
    if [ -w "/usr/local/bin" ]; then
        ln -sf "$LLAMA_DIR/start-server.sh" /usr/local/bin/forgekeeper-llama
        info "Created symlink: /usr/local/bin/forgekeeper-llama"
    else
        warn "Could not create symlink in /usr/local/bin (permission denied)"
        info "You can run the server with: $LLAMA_DIR/start-server.sh"
    fi
}

# Print next steps
print_next_steps() {
    info "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Download Qwen3-Coder model:"
    echo "   ./scripts/download-qwen.sh"
    echo ""
    echo "2. Start the inference server:"
    echo "   $LLAMA_DIR/start-server.sh"
    echo "   or: forgekeeper-llama (if symlink was created)"
    echo ""
    echo "3. Test the server:"
    echo "   curl http://localhost:8080/health"
    echo ""
    echo "Configuration:"
    echo "  LLAMA_DIR=$LLAMA_DIR"
    echo "  MODEL_PATH=$HOME/.forgekeeper/models/qwen3-coder-32b-instruct-q5_k_m.gguf"
}

# Main execution
main() {
    info "Starting llama.cpp setup..."
    echo ""

    check_prerequisites || warn "Some prerequisites are missing"
    clone_llama
    build_llama
    verify_installation
    create_helpers
    print_next_steps
}

main "$@"
