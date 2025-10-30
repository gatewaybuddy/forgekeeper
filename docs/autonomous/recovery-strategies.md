# Recovery Strategy Framework
**Task**: T305
**Status**: Complete
**Date**: 2025-10-29

## Overview

Defines systematic recovery approaches for each error category. When the autonomous agent encounters a failure, it uses these strategies to generate concrete recovery plans.

## Recovery Decision Tree

```
Tool Failure Detected
  ↓
Classify Error Type (T304)
  ↓
Look Up Recovery Chain
  ↓
Generate Recovery Plan (Priority 1, 2, 3, ...)
  ↓
Execute Recovery Strategy
  ↓
If Success: Continue task
If Failure: Try next strategy in chain
If All Fail: Ask user or mark stuck
```

## Recovery Chains by Error Type

### 1. command_not_found (Exit 127)

**Example**: `git clone` fails because git not installed

**Recovery Chain**:
1. **Alternative Command** (Priority 1, Confidence: 0.9)
   - Strategy: Use different tool to achieve same goal
   - Example: `curl + tar` instead of `git clone`
   - Tools: `run_bash`
   - Steps:
     ```bash
     curl -L https://github.com/user/repo/archive/refs/heads/main.tar.gz -o repo.tar.gz
     tar -xzf repo.tar.gz
     ```

2. **Manual Installation** (Priority 2, Confidence: 0.6)
   - Strategy: Try to install the missing command
   - Tools: `run_bash`
   - Steps:
     ```bash
     # Debian/Ubuntu
     apt-get update && apt-get install -y git
     # Or Alpine
     apk add --no-cache git
     ```

3. **Ask User** (Priority 3, Confidence: 0.9)
   - Strategy: Request user to install binary or provide alternative
   - Tools: None
   - Action: Generate clarifying questions

---

### 2. tool_not_found

**Example**: Agent tries `repo_browser` but tool not in allowlist

**Recovery Chain**:
1. **Use Available Alternative** (Priority 1, Confidence: 0.8)
   - Strategy: Find similar tool from available tools list
   - Example: Use `read_dir` + `read_file` instead of `repo_browser`
   - Tools: `read_dir`, `read_file`, `run_bash`

2. **Decompose into Basic Tools** (Priority 2, Confidence: 0.7)
   - Strategy: Break down task into basic operations
   - Example: Use shell commands for file operations
   - Tools: `run_bash`

3. **Ask User to Enable Tool** (Priority 3, Confidence: 0.6)
   - Strategy: Request user to add tool to allowlist
   - Tools: None

---

### 3. permission_denied

**Example**: Writing file to `/etc/` fails

**Recovery Chain**:
1. **Try Sandbox Directory** (Priority 1, Confidence: 0.9)
   - Strategy: Write to allowed sandbox location
   - Example: Write to `.forgekeeper/sandbox/` instead of `/etc/`
   - Tools: `write_file`, `read_dir`
   - Steps:
     1. Check `TOOLS_FS_ROOT` sandbox boundaries
     2. Rewrite path to sandbox-relative
     3. Retry operation

2. **Check Permissions** (Priority 2, Confidence: 0.5)
   - Strategy: Try with sudo or chmod
   - Tools: `run_bash`
   - Caution: Only suggest if clearly safe

3. **Ask User for Permissions** (Priority 3, Confidence: 0.8)
   - Strategy: Request user to adjust permissions or use sudo
   - Tools: None

---

### 4. timeout

**Example**: Long-running command exceeds timeout

**Recovery Chain**:
1. **Reduce Scope** (Priority 1, Confidence: 0.8)
   - Strategy: Process smaller chunks at a time
   - Example: Process 10 files instead of 100
   - Tools: Same as original, with modified parameters

2. **Increase Timeout** (Priority 2, Confidence: 0.6)
   - Strategy: Retry with higher timeout limit
   - Example: `timeout_ms: 30000` instead of `15000`
   - Tools: Same as original

3. **Stream Results** (Priority 3, Confidence: 0.7)
   - Strategy: Process incrementally instead of all-at-once
   - Example: Use `find | xargs` instead of single command
   - Tools: `run_bash`

4. **Background Execution** (Priority 4, Confidence: 0.5)
   - Strategy: Run in background and poll for results
   - Tools: `run_bash` with background flag

---

### 5. file_not_found (ENOENT)

**Example**: `read_file("config.yaml")` fails

**Recovery Chain**:
1. **Verify Path** (Priority 1, Confidence: 0.9)
   - Strategy: Check if file exists with different casing or location
   - Tools: `read_dir`, `run_bash`
   - Steps:
     1. List parent directory
     2. Check for similar filenames (typos, casing)
     3. Search in common locations

2. **Create Missing File** (Priority 2, Confidence: 0.6)
   - Strategy: Create file with default content
   - Tools: `write_file`
   - Caution: Only if file creation is appropriate for task

3. **Ask User for Correct Path** (Priority 3, Confidence: 0.8)
   - Strategy: Request user to provide correct file path
   - Tools: None

---

### 6. invalid_arguments

**Example**: Tool parameter has wrong type

**Recovery Chain**:
1. **Fix Parameter Types** (Priority 1, Confidence: 1.0)
   - Strategy: Convert parameters to correct types
   - Example: Convert string to number, object to JSON string
   - Tools: Same as original, with corrected args

2. **Check Schema** (Priority 2, Confidence: 0.9)
   - Strategy: Review tool parameter schema and provide all required fields
   - Tools: Same as original

3. **Simplify Arguments** (Priority 3, Confidence: 0.7)
   - Strategy: Use minimal required parameters
   - Tools: Same as original

---

### 7. syntax_error

**Example**: Bash command has syntax error

**Recovery Chain**:
1. **Fix Syntax** (Priority 1, Confidence: 0.8)
   - Strategy: Correct common syntax mistakes
   - Example: Add quotes, escape special chars, fix pipe syntax
   - Tools: Same as original

2. **Use Simpler Command** (Priority 2, Confidence: 0.9)
   - Strategy: Break complex command into simpler steps
   - Example: Use multiple simple commands instead of one complex pipeline
   - Tools: `run_bash`

3. **Try Alternative Syntax** (Priority 3, Confidence: 0.6)
   - Strategy: Use POSIX-compliant syntax instead of bash-specific
   - Tools: `run_bash`

---

### 8. network_error

**Example**: HTTP request fails

**Recovery Chain**:
1. **Retry with Backoff** (Priority 1, Confidence: 0.7)
   - Strategy: Wait and retry (exponential backoff)
   - Tools: Same as original

2. **Try Alternative Host/URL** (Priority 2, Confidence: 0.6)
   - Strategy: Use mirror or CDN
   - Example: Use `archive.org` or `githubusercontent.com` instead of `github.com`
   - Tools: Same as original

3. **Use Cached Data** (Priority 3, Confidence: 0.5)
   - Strategy: Use previously downloaded data if available
   - Tools: `read_file`, `read_dir`

4. **Ask User about Connectivity** (Priority 4, Confidence: 0.8)
   - Strategy: Request user to check network or provide alternative
   - Tools: None

---

### 9. rate_limited

**Example**: API returns 429 Too Many Requests

**Recovery Chain**:
1. **Wait and Retry** (Priority 1, Confidence: 0.9)
   - Strategy: Wait for rate limit window to reset
   - Example: Wait 60 seconds then retry
   - Tools: Same as original

2. **Reduce Request Frequency** (Priority 2, Confidence: 0.8)
   - Strategy: Batch requests or add delays
   - Tools: Same as original with delays

3. **Use Alternative API/Source** (Priority 3, Confidence: 0.6)
   - Strategy: Switch to different data source
   - Tools: Different API or local data

---

### 10. disk_full (ENOSPC)

**Example**: Cannot write file due to no space

**Recovery Chain**:
1. **Clean Up Temp Files** (Priority 1, Confidence: 0.6)
   - Strategy: Remove temporary files to free space
   - Tools: `run_bash`
   - Steps:
     ```bash
     rm -rf /tmp/*.tmp
     rm -rf .forgekeeper/playground/*.tmp
     ```

2. **Write Smaller File** (Priority 2, Confidence: 0.5)
   - Strategy: Truncate or compress content
   - Tools: `write_file`

3. **Ask User to Free Space** (Priority 3, Confidence: 0.9)
   - Strategy: Request user to clean disk or provide more storage
   - Tools: None

---

## Recovery Plan Generation

When generating a recovery plan, the system:

1. **Classifies Error** using T304 error-classifier
2. **Looks Up Recovery Chain** for that category
3. **Filters Strategies** based on available tools
4. **Prioritizes** by confidence score and estimated iterations
5. **Generates Concrete Steps** with actual tool calls and parameters

### Example Recovery Plan (command_not_found)

```json
{
  "priority": 1,
  "strategy": "alternative_command_curl_tar",
  "confidence": 0.9,
  "estimatedIterations": 3,
  "steps": [
    {
      "action": "Download repository tarball from GitHub",
      "tool": "run_bash",
      "args": {
        "script": "curl -L https://github.com/gatewaybuddy/forgekeeper/archive/refs/heads/main.tar.gz -o repo.tar.gz"
      },
      "expectedOutcome": "repo.tar.gz file created"
    },
    {
      "action": "Extract tarball contents",
      "tool": "run_bash",
      "args": {
        "script": "tar -xzf repo.tar.gz"
      },
      "expectedOutcome": "Repository files extracted to directory"
    },
    {
      "action": "Verify extraction",
      "tool": "read_dir",
      "args": {
        "dir": "./forgekeeper-main"
      },
      "expectedOutcome": "Directory listing shows repo structure"
    }
  ],
  "fallbackChain": ["manual_installation", "ask_user"]
}
```

---

## Strategy Selection Heuristics

### When to Use Each Priority Level

**Priority 1 (Highest)**:
- Highest confidence (>0.8)
- Lowest estimated iterations (1-3)
- No user interaction required
- Uses available tools only

**Priority 2**:
- Medium confidence (0.6-0.8)
- Medium iterations (3-5)
- May require risky operations (install, sudo)

**Priority 3**:
- Lower confidence (0.5-0.7)
- Or requires user interaction
- Fallback options

**Priority 4+ (Last Resort)**:
- Low confidence (<0.5)
- Or very high iterations (>5)
- Or experimental approaches

---

## Fallback Chain Rules

1. **Always include "ask_user" as final fallback** if all automated strategies fail
2. **Never repeat same strategy twice** in a chain
3. **Order by confidence × simplicity** (prefer simple high-confidence over complex high-confidence)
4. **Limit to 3-4 strategies per chain** to avoid overwhelming agent
5. **Skip strategies if required tools unavailable**

---

## Future Enhancements

1. **Learning from Success**: Track which strategies succeed most often for each error type
2. **Context-Aware Selection**: Adjust strategies based on task type (exploratory vs implementation)
3. **User Preference Integration**: Learn which strategies user prefers (e.g., never use sudo)
4. **Cross-Error Patterns**: Detect when multiple errors indicate deeper systemic issue
5. **Adaptive Confidence**: Adjust confidence scores based on historical success rates

---

## References

- **ADR-0003**: Diagnostic Reflection
- **T304**: Error Classification System
- **T306**: Recovery Planner Implementation
