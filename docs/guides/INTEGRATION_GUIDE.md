# Enhanced Features Integration Guide

## Quick Start

### Step 1: Add Environment Variables

Add to `.env` or `forgekeeper/.env`:

```bash
# Phase 1: Output Truncation & Events
TOOLS_MAX_OUTPUT_BYTES=10240
TOOLS_MAX_OUTPUT_LINES=256
TOOLS_TRUNCATION_STRATEGY=head-tail
FRONTEND_ENABLE_ENHANCED_ORCHESTRATOR=1

# Phase 2: Code Review
FRONTEND_ENABLE_REVIEW=1
FRONTEND_REVIEW_MODEL=core

# Phase 3: History Compaction
FRONTEND_ENABLE_AUTO_COMPACT=1
FRONTEND_MAX_HISTORY_TOKENS=20000
FRONTEND_RECENT_MESSAGES_KEEP=10
```

### Step 2: Update server.mjs

Add these lines near the top of `frontend/server.mjs` (after existing imports):

```javascript
// Enhanced Features Integration (Phase 1-3)
import { setupEnhancedFeatures, orchestrateWithToolsEnhanced } from './server.enhanced-integration.mjs';

// Setup enhanced features (after app creation, before routes)
setupEnhancedFeatures(app);
```

### Step 3: Update Chat Endpoint (Optional - Enhanced Orchestrator)

In `frontend/server.mjs`, find the `/api/chat` endpoint and update it to use enhanced orchestrator:

```javascript
app.post('/api/chat', async (req, res) => {
  // ... existing code ...

  // Check if enhanced orchestrator should be used
  const useEnhanced = process.env.FRONTEND_ENABLE_ENHANCED_ORCHESTRATOR === '1';

  const result = useEnhanced
    ? await orchestrateWithToolsEnhanced({
        baseUrl: apiBase,
        model,
        messages,
        tools: allowedTools,
        maxIterations: 4,
        maxTokens,
        temperature,
        topP,
        presencePenalty,
        frequencyPenalty,
        convId: req.body.conv_id,
        enablePhase1: true,
        enablePhase3: process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1',
      })
    : await orchestrateWithTools({
        baseUrl: apiBase,
        model,
        messages,
        tools: allowedTools,
        maxIterations: 4,
        maxTokens,
        temperature,
        topP,
        presencePenalty,
        frequencyPenalty,
      });

  // ... rest of existing code ...
});
```

### Step 4: Test Integration

```bash
cd forgekeeper/frontend

# Test the enhanced endpoints
curl http://localhost:3000/api/enhanced/health
curl http://localhost:3000/api/enhanced/stats

# Test code review
curl -X POST http://localhost:3000/api/code-review/criteria

# Run unit tests
npm run test
```

## Integration Methods

### Method 1: Quick Integration (Recommended)

This method adds enhanced features alongside existing code without modifications:

1. Add environment variables (Step 1 above)
2. Add single line to server.mjs:
   ```javascript
   import { setupEnhancedFeatures } from './server.enhanced-integration.mjs';
   setupEnhancedFeatures(app);
   ```
3. Done! Features are now available via new endpoints

**Available endpoints**:
- `GET /api/enhanced/health` - Health check
- `GET /api/enhanced/stats` - Feature statistics
- `POST /api/code-review` - Code review
- `POST /api/code-review/file` - Single file review
- `POST /api/code-review/diff` - Diff review
- `GET /api/code-review/criteria` - Available criteria

### Method 2: Full Integration (Advanced)

This method replaces the orchestrator for all chat requests:

1. Do steps from Method 1
2. Update `/api/chat` endpoint to use `orchestrateWithToolsEnhanced` (see Step 3 above)
3. Enhanced features (truncation, events, compaction) now apply to all chats

## Testing Each Phase

### Phase 1: Output Truncation & Events

```bash
# Set environment
export TOOLS_MAX_OUTPUT_BYTES=100
export TOOLS_TRUNCATION_STRATEGY=head-tail

# Test with a tool that produces large output
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "List all files recursively"}],
    "model": "core"
  }'

# Check that output is truncated and events are logged
tail -f .forgekeeper/context_log/ctx-*.jsonl
```

### Phase 2: Code Review

```bash
# Test code review with SQL injection vulnerability
curl -X POST http://localhost:3000/api/code-review \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [{
      "file_path": "test.js",
      "diff": "function login(user, pass) {\n  const q = `SELECT * FROM users WHERE name=\"${user}\"`;\n  return db.query(q);\n}",
      "language": "javascript"
    }],
    "criteria": ["security"],
    "conv_id": "test"
  }'

# Should return critical security finding about SQL injection
```

### Phase 3: History Compaction

```bash
# Set environment
export FRONTEND_ENABLE_AUTO_COMPACT=1
export FRONTEND_MAX_HISTORY_TOKENS=1000

# Send a long conversation (will be truncated at file read level, but you get the idea)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [/* many messages totaling >1000 tokens */],
    "model": "core"
  }'

# Check logs for compaction event
grep "history_compaction" .forgekeeper/context_log/ctx-*.jsonl
```

## Verification Checklist

After integration, verify:

- [ ] Server starts without errors
- [ ] `GET /api/enhanced/health` returns `{"status": "ok"}`
- [ ] `GET /api/enhanced/stats` shows enabled features
- [ ] `GET /api/code-review/criteria` returns 5 criteria
- [ ] Regular chat still works (`POST /api/chat`)
- [ ] ContextLog shows new event types (tool_call_begin, tool_call_end, etc.)
- [ ] Large tool outputs are truncated
- [ ] Code review works with test input

## Troubleshooting

### Enhanced features not showing up

**Check**:
1. Environment variables are set correctly
2. `setupEnhancedFeatures(app)` is called in server.mjs
3. Server restarted after changes
4. Check console for `[Enhanced Integration]` messages

**Fix**:
```bash
# Check if feature flags are recognized
curl http://localhost:3000/api/enhanced/stats | jq '.phase1.enabled'
# Should return true if Phase 1 is enabled
```

### Code review endpoint returns 404

**Check**:
1. `FRONTEND_ENABLE_REVIEW=1` is set
2. Code review router is mounted
3. Check console for "[Code Review] ✓ Endpoints mounted"

**Fix**:
```bash
# Verify environment
echo $FRONTEND_ENABLE_REVIEW  # Should be "1"

# Test if endpoint exists
curl -I http://localhost:3000/api/code-review/criteria
# Should return 200, not 404
```

### Compaction not triggering

**Check**:
1. `FRONTEND_ENABLE_AUTO_COMPACT=1` is set
2. Conversation actually exceeds `FRONTEND_MAX_HISTORY_TOKENS`
3. Check logs for compaction trigger message

**Fix**:
```bash
# Lower threshold for testing
export FRONTEND_MAX_HISTORY_TOKENS=500

# Send long conversation
# Check logs
tail -f .forgekeeper/context_log/ctx-*.jsonl | grep compaction
```

### Import errors

**Fix**:
```bash
# Make sure all new files exist
ls -la frontend/core/orchestrator/truncator.mjs
ls -la frontend/core/services/contextlog-events.mjs
ls -la frontend/core/tools/executor.mjs
ls -la frontend/core/evaluation/reviewer.mjs
ls -la frontend/core/history/compactor.mjs

# If missing, verify file creation step
```

## Rollback

If you need to disable enhanced features:

```bash
# Method 1: Environment variables
export FRONTEND_ENABLE_ENHANCED_ORCHESTRATOR=0
export FRONTEND_ENABLE_REVIEW=0
export FRONTEND_ENABLE_AUTO_COMPACT=0

# Method 2: Comment out integration line in server.mjs
# setupEnhancedFeatures(app); // <-- commented out

# Restart server
npm restart
```

## Next Steps

After successful integration:

1. **UI Integration**: Add UI components for:
   - Code review panel
   - History statistics
   - Event stream viewer

2. **Testing**: Run comprehensive tests:
   ```bash
   npm run test
   npm run test:integration
   ```

3. **Monitoring**: Watch ContextLog for new events:
   ```bash
   tail -f .forgekeeper/context_log/ctx-*.jsonl | jq .type
   ```

4. **Tuning**: Adjust thresholds based on usage:
   - Truncation limits (TOOLS_MAX_OUTPUT_BYTES)
   - Compaction threshold (FRONTEND_MAX_HISTORY_TOKENS)
   - Review criteria selection

## Support

Issues? Check:
- [Architecture Document](docs/FORGEKEEPER_ENHANCEMENT_ARCHITECTURE.md)
- [Phase 1 Guide](forgekeeper/frontend/core/README.md)
- [Phase 2 Guide](docs/PHASE2_REVIEW_MODE_IMPLEMENTATION.md)
- [Phase 3 Guide](docs/PHASE3_HISTORY_COMPACTION.md)
