# Forgekeeper Command Setup

Make `forgekeeper` available as a global command without needing to type `python3 -m forgekeeper`.

---

## Quick Setup

### Option 1: Add to PATH (Recommended)

**For Linux/WSL/macOS:**

Add this line to your shell config file:

```bash
# For Bash: ~/.bashrc
# For Zsh: ~/.zshrc
# For Fish: ~/.config/fish/config.fish

export PATH="/mnt/d/projects/codex/forgekeeper/bin:$PATH"
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

**For Windows (PowerShell):**

Add to PowerShell profile (`$PROFILE`):
```powershell
$env:PATH = "D:\projects\codex\forgekeeper\bin;$env:PATH"
```

Or add via System Environment Variables:
1. Search for "Environment Variables" in Windows
2. Edit `PATH` variable
3. Add `D:\projects\codex\forgekeeper\bin`

### Option 2: Create Symlink

**For Linux/WSL/macOS:**

```bash
# Create symlink in /usr/local/bin (requires sudo)
sudo ln -s /mnt/d/projects/codex/forgekeeper/bin/forgekeeper /usr/local/bin/forgekeeper

# Or in ~/bin (no sudo needed, add ~/bin to PATH if not already)
mkdir -p ~/bin
ln -s /mnt/d/projects/codex/forgekeeper/bin/forgekeeper ~/bin/forgekeeper
export PATH="$HOME/bin:$PATH"  # Add to ~/.bashrc or ~/.zshrc
```

### Option 3: Create Alias

**For Linux/WSL/macOS:**

Add to `~/.bashrc` or `~/.zshrc`:
```bash
alias forgekeeper='/mnt/d/projects/codex/forgekeeper/bin/forgekeeper'
```

**For Windows (PowerShell):**

Add to PowerShell profile:
```powershell
function forgekeeper { & "D:\projects\codex\forgekeeper\bin\forgekeeper.cmd" @args }
```

---

## Verify Installation

After setup, test that it works:

```bash
# Should show help
forgekeeper --help

# Should start conversation
forgekeeper talk

# Should show status
forgekeeper c status
```

---

## Usage

Once set up, you can run forgekeeper from anywhere:

```bash
# Start full stack
forgekeeper

# Conversational interface
forgekeeper talk

# Consciousness commands
forgekeeper c status
forgekeeper c health
forgekeeper c ask "What are you thinking?"

# Quick chat
forgekeeper chat -p "Hello, world!"
```

---

## Troubleshooting

**Command not found:**
- Verify the path is correct in your shell config
- Reload your shell: `source ~/.bashrc`
- Check PATH: `echo $PATH` (should include `/mnt/d/projects/codex/forgekeeper/bin`)

**Permission denied (Linux/WSL):**
- Make script executable: `chmod +x /mnt/d/projects/codex/forgekeeper/bin/forgekeeper`

**Module not found:**
- Ensure you're running from within WSL or have Python configured correctly
- Try explicit: `/mnt/d/projects/codex/forgekeeper/bin/forgekeeper --help`

**Windows: Script not recognized:**
- Make sure you're using `forgekeeper.cmd` on Windows (not the bash script)
- Add `.CMD` to PATHEXT if needed

---

## Recommended: Auto-Complete (Optional)

For bash/zsh auto-completion, add this to your shell config:

```bash
# Bash
eval "$(/mnt/d/projects/codex/forgekeeper/bin/forgekeeper --help | grep -A100 'positional arguments' | awk '{print $1}' | xargs -I{} echo "complete -W '{}' forgekeeper")"

# Or simpler:
complete -W "consciousness c talk repl compose up-core chat ensure-stack switch-core" forgekeeper
```

---

## One-Line Install (Recommended)

**For WSL/Linux/macOS:**

```bash
echo 'export PATH="/mnt/d/projects/codex/forgekeeper/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc && forgekeeper --help
```

**For Windows PowerShell:**

```powershell
Add-Content $PROFILE '$env:PATH = "D:\projects\codex\forgekeeper\bin;$env:PATH"'; . $PROFILE; forgekeeper --help
```

---

That's it! Now you can just type `forgekeeper` from anywhere!
