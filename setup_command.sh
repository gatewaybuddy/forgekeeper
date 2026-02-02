#!/usr/bin/env bash
#
# Quick setup script to make 'forgekeeper' command available globally
#

set -e

echo "🔧 Forgekeeper Command Setup"
echo "=============================="
echo

# Detect shell
if [ -n "$BASH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
    SHELL_NAME="bash"
elif [ -n "$ZSH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
    SHELL_NAME="zsh"
else
    echo "⚠️  Could not detect shell type. Please add manually to your shell config."
    echo "   Add this line: export PATH=\"/mnt/d/projects/codex/forgekeeper/bin:\$PATH\""
    exit 1
fi

echo "Detected shell: $SHELL_NAME"
echo "Config file: $SHELL_CONFIG"
echo

# Check if already in config
if grep -q "forgekeeper/bin" "$SHELL_CONFIG" 2>/dev/null; then
    echo "✅ Forgekeeper is already in your PATH!"
else
    echo "Adding forgekeeper to PATH in $SHELL_CONFIG..."
    echo "" >> "$SHELL_CONFIG"
    echo "# Forgekeeper command (added by setup_command.sh)" >> "$SHELL_CONFIG"
    echo 'export PATH="/mnt/d/projects/codex/forgekeeper/bin:$PATH"' >> "$SHELL_CONFIG"
    echo "✅ Added to $SHELL_CONFIG"
fi

echo
echo "To activate now, run:"
echo "  source $SHELL_CONFIG"
echo
echo "Or just open a new terminal."
echo
echo "Test with:"
echo "  forgekeeper --help"
echo

# Offer to source now
read -p "Reload shell config now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Note: This sources in the script's context, user still needs to manually source
    # or open new terminal for it to persist
    source "$SHELL_CONFIG"
    echo "✅ Reloaded! Try: forgekeeper --help"
    
    # Test it
    if command -v forgekeeper &> /dev/null; then
        echo "✅ Success! 'forgekeeper' command is ready to use!"
    else
        echo "⚠️  Command added but not yet active. Please open a new terminal or run:"
        echo "  source $SHELL_CONFIG"
    fi
else
    echo "Run this to activate:"
    echo "  source $SHELL_CONFIG"
fi

echo
echo "🎉 Setup complete!"
