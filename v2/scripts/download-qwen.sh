#!/bin/bash
#
# Download Qwen3-Coder-32B-Instruct GGUF model
# Optimized for RTX 5090 with 32GB VRAM
#

set -e

# Configuration
MODELS_DIR="${MODELS_DIR:-$HOME/.forgekeeper/models}"
MODEL_NAME="${MODEL_NAME:-qwen3-coder-32b-instruct-q5_k_m.gguf}"
HUGGINGFACE_REPO="${HUGGINGFACE_REPO:-Qwen/Qwen3-Coder-32B-Instruct-GGUF}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

progress() {
    echo -e "${BLUE}[PROGRESS]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."

    # Check for wget or curl
    if command -v wget &> /dev/null; then
        DOWNLOADER="wget"
    elif command -v curl &> /dev/null; then
        DOWNLOADER="curl"
    else
        error "Neither wget nor curl found. Please install one of them."
    fi

    info "Using $DOWNLOADER for downloads"

    # Check for huggingface-cli (optional but recommended)
    if command -v huggingface-cli &> /dev/null; then
        info "huggingface-cli found - will use for faster downloads"
        HF_CLI=true
    else
        warn "huggingface-cli not found - will use direct HTTP download"
        warn "For faster downloads, install: pip install huggingface-hub[cli]"
        HF_CLI=false
    fi
}

# Check disk space
check_disk_space() {
    info "Checking disk space..."

    REQUIRED_GB=22
    REQUIRED_BYTES=$((REQUIRED_GB * 1024 * 1024 * 1024))

    AVAILABLE=$(df -B1 "$MODELS_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")

    if [ "$AVAILABLE" -lt "$REQUIRED_BYTES" ]; then
        error "Insufficient disk space. Required: ${REQUIRED_GB}GB, Available: $((AVAILABLE / 1024 / 1024 / 1024))GB"
    fi

    info "Disk space check passed (${REQUIRED_GB}GB required, $((AVAILABLE / 1024 / 1024 / 1024))GB available)"
}

# Create models directory
setup_directory() {
    info "Setting up models directory..."

    mkdir -p "$MODELS_DIR"
    cd "$MODELS_DIR"

    info "Models directory: $MODELS_DIR"
}

# Download with huggingface-cli
download_with_hf_cli() {
    info "Downloading model with huggingface-cli..."

    huggingface-cli download \
        "$HUGGINGFACE_REPO" \
        "$MODEL_NAME" \
        --local-dir "$MODELS_DIR" \
        --local-dir-use-symlinks False \
        --resume-download \
        || error "Download failed"

    info "Download completed successfully!"
}

# Download with wget
download_with_wget() {
    info "Downloading model with wget..."

    URL="https://huggingface.co/$HUGGINGFACE_REPO/resolve/main/$MODEL_NAME"
    OUTPUT="$MODELS_DIR/$MODEL_NAME"

    wget \
        --continue \
        --show-progress \
        --timeout=300 \
        --tries=3 \
        -O "$OUTPUT" \
        "$URL" \
        || error "Download failed"

    info "Download completed successfully!"
}

# Download with curl
download_with_curl() {
    info "Downloading model with curl..."

    URL="https://huggingface.co/$HUGGINGFACE_REPO/resolve/main/$MODEL_NAME"
    OUTPUT="$MODELS_DIR/$MODEL_NAME"

    curl \
        -L \
        -C - \
        --max-time 300 \
        --retry 3 \
        -o "$OUTPUT" \
        "$URL" \
        || error "Download failed"

    info "Download completed successfully!"
}

# Download model
download_model() {
    MODEL_PATH="$MODELS_DIR/$MODEL_NAME"

    # Check if model already exists
    if [ -f "$MODEL_PATH" ]; then
        FILE_SIZE=$(stat -f%z "$MODEL_PATH" 2>/dev/null || stat -c%s "$MODEL_PATH" 2>/dev/null || echo "0")
        FILE_SIZE_GB=$((FILE_SIZE / 1024 / 1024 / 1024))

        if [ "$FILE_SIZE" -gt 20000000000 ]; then  # > 20GB
            warn "Model file already exists ($FILE_SIZE_GB GB)"
            read -p "Do you want to re-download it? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                info "Using existing model file"
                return 0
            fi
        else
            warn "Existing model file is incomplete ($FILE_SIZE_GB GB)"
            info "Will resume download..."
        fi
    fi

    # Download based on available tool
    if [ "$HF_CLI" = true ]; then
        download_with_hf_cli
    elif [ "$DOWNLOADER" = "wget" ]; then
        download_with_wget
    else
        download_with_curl
    fi
}

# Verify download
verify_model() {
    info "Verifying model file..."

    MODEL_PATH="$MODELS_DIR/$MODEL_NAME"

    if [ ! -f "$MODEL_PATH" ]; then
        error "Model file not found: $MODEL_PATH"
    fi

    FILE_SIZE=$(stat -f%z "$MODEL_PATH" 2>/dev/null || stat -c%s "$MODEL_PATH" 2>/dev/null || echo "0")
    FILE_SIZE_GB=$((FILE_SIZE / 1024 / 1024 / 1024))

    if [ "$FILE_SIZE" -lt 20000000000 ]; then  # < 20GB
        error "Model file appears incomplete (${FILE_SIZE_GB}GB). Expected ~22GB."
    fi

    info "Model file verified successfully (${FILE_SIZE_GB}GB)"
}

# Print model info
print_model_info() {
    echo ""
    info "Model Information:"
    echo ""
    echo "  Name:        Qwen3-Coder-32B-Instruct"
    echo "  Quantization: Q5_K_M"
    echo "  Size:        ~22GB"
    echo "  Context:     32K tokens"
    echo "  Location:    $MODELS_DIR/$MODEL_NAME"
    echo ""
    echo "Recommended Settings for RTX 5090:"
    echo "  GPU Layers:  99 (full offload)"
    echo "  Context:     32768 tokens"
    echo "  Threads:     8"
    echo "  Flash Attention: Enabled"
    echo "  Batch Size:  512"
    echo ""
}

# Print next steps
print_next_steps() {
    info "Download complete!"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Start the inference server:"
    echo "   ./scripts/start-local-inference.sh"
    echo "   or: forgekeeper-llama (if you ran setup-llama.sh)"
    echo ""
    echo "2. Test the server:"
    echo "   curl http://localhost:8080/health"
    echo ""
    echo "3. Run a test inference:"
    echo "   curl http://localhost:8080/v1/chat/completions \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Hello!\"}]}'"
    echo ""
}

# Main execution
main() {
    info "Starting Qwen3-Coder download..."
    echo ""

    check_prerequisites
    check_disk_space
    setup_directory
    download_model
    verify_model
    print_model_info
    print_next_steps
}

main "$@"
