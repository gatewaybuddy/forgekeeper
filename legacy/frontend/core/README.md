# Forgekeeper Core Modules

Enhanced core modules for Forgekeeper, inspired by OpenAI's Codex architecture.

## Architecture

```
core/
├── orchestrator/
│   └── truncator.mjs          # Output truncation (head+tail strategy)
├── tools/
│   └── executor.mjs           # Unified tool execution wrapper
└── services/
    └── contextlog-events.mjs  # Enhanced event emitter (20+ event types)
```

## Features

### 1. Output Truncation

Prevents context window overflow by intelligently truncating large tool outputs.

**Usage**:
```javascript
import { createTruncator } from './core/orchestrator/truncator.mjs';

const truncator = createTruncator({
  maxBytes: 10240,      // 10KB default
  maxLines: 256,        // Max lines
  strategy: 'head-tail' // Show beginning and end
});

const result = truncator.truncate(largeOutput, 'read_file');

console.log(result.truncated);      // true/false
console.log(result.content);        // Truncated output
console.log(result.originalBytes);  // Original size
```

**Tool-Specific Limits**:
```javascript
truncator.setToolLimit('run_bash', {
  bytes: 20480,  // 20KB for shell output
  lines: 512
});
```

### 2. Enhanced Event Taxonomy

Comprehensive event tracking for diagnostics, observability, and UI updates.

**Event Types** (20+):
- **Lifecycle**: `task_started`, `task_complete`
- **Tools**: `tool_call_begin`, `tool_call_output_delta`, `tool_call_end`, `tool_call_error`
- **Reasoning**: `reasoning_delta`, `reasoning_section_break`
- **Approval**: `approval_request`, `approval_granted`, `approval_denied`
- **Tracking**: `turn_diff`, `token_count`
- **Validation**: `validation_error`, `review_completed`
- **History**: `history_compaction`

**Usage**:
```javascript
import { contextLogEvents } from './core/services/contextlog-events.mjs';

// Emit events
await contextLogEvents.emitToolCallBegin(
  'conv-123',
  1,
  toolCall,
  'workspace'
);

await contextLogEvents.emitToolCallEnd(
  'conv-123',
  1,
  toolCall,
  result,
  elapsedMs,
  truncated,
  originalBytes
);

// Listen to events
contextLogEvents.on('tool_call_end', (event) => {
  console.log(`Tool ${event.name} took ${event.elapsed_ms}ms`);
});

// Listen to all events
contextLogEvents.on('*', (event) => {
  console.log(`Event: ${event.type}`);
});
```

### 3. Tool Executor

Unified wrapper for tool execution with consistent error handling, truncation, and event emission.

**Usage**:
```javascript
import { createExecutor } from './core/tools/executor.mjs';

const executor = createExecutor({
  toolRegistry: toolRegistry,
  truncatorConfig: {
    maxBytes: 10240,
    maxLines: 256,
    strategy: 'head-tail'
  },
  sandboxLevel: 'workspace'
});

// Execute a single tool
const result = await executor.execute(toolCall, {
  convId: 'conv-123',
  turnId: 1,
  cwd: process.cwd(),
  sandboxRoot: '.forgekeeper/sandbox'
});

console.log(result.content);       // Tool output
console.log(result.truncated);     // Was it truncated?
console.log(result.elapsedMs);     // Execution time
console.log(result.exitCode);      // Exit code (shell tools)

// Execute multiple tools in sequence
const results = await executor.executeSequence(toolCalls, context);

// Execute multiple tools in parallel
const results = await executor.executeParallel(toolCalls, context);
```

## Integration Example

Here's how to integrate these modules into your orchestrator:

```javascript
// server.orchestrator.mjs
import { createExecutor } from './core/tools/executor.mjs';
import { contextLogEvents } from './core/services/contextlog-events.mjs';

export async function orchestrateWithTools(messages, tools, config) {
  const convId = config.conv_id || ulid();
  const turnId = config.turn_id || 0;

  // Create executor with truncation
  const executor = createExecutor({
    toolRegistry: toolRegistry,
    truncatorConfig: {
      maxBytes: parseInt(process.env.TOOLS_MAX_OUTPUT_BYTES) || 10240,
      maxLines: parseInt(process.env.TOOLS_MAX_OUTPUT_LINES) || 256,
      strategy: process.env.TOOLS_TRUNCATION_STRATEGY || 'head-tail'
    }
  });

  // Emit task started
  await contextLogEvents.emitTaskStarted(convId, turnId, {
    model: config.model,
    approvalPolicy: config.approvalPolicy || 'prompt',
    sandboxPolicy: config.sandboxPolicy || 'workspace',
    reasoningEffort: config.reasoningEffort
  });

  const startTime = Date.now();
  let toolCallsCount = 0;

  // Tool execution loop
  let response = await callUpstream(messages, tools, config);

  while (response.tool_calls && response.tool_calls.length > 0) {
    toolCallsCount += response.tool_calls.length;

    // Execute all tool calls
    for (const toolCall of response.tool_calls) {
      const result = await executor.execute(toolCall, {
        convId,
        turnId,
        cwd: process.cwd(),
        sandboxRoot: config.sandboxRoot || '.forgekeeper/sandbox'
      });

      // Add tool result to messages
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.content
      });
    }

    // Get next response
    response = await callUpstream(messages, tools, config);
  }

  // Emit task complete
  await contextLogEvents.emitTaskComplete(
    convId,
    turnId,
    Date.now() - startTime,
    toolCallsCount,
    {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
      reasoning_output_tokens: response.usage?.completion_tokens_details?.reasoning_tokens || 0
    }
  );

  return {
    assistant: response.choices[0].message,
    messages,
    debug: {
      tool_calls: toolCallsCount,
      duration_ms: Date.now() - startTime
    }
  };
}
```

## Configuration

Add to `.env`:

```bash
# Output Truncation
TOOLS_MAX_OUTPUT_BYTES=10240      # 10KB default
TOOLS_MAX_OUTPUT_LINES=256        # Max lines
TOOLS_TRUNCATION_STRATEGY=head-tail  # head-tail | head-only

# Events
FRONTEND_ENABLE_STREAMING_EVENTS=1  # Stream events via SSE
FRONTEND_EVENT_BUFFER_SIZE=100      # Event buffer size
```

## TypeScript Definitions

All events have TypeScript definitions in `types/events.d.ts`:

```typescript
import type {
  Event,
  ToolCallBeginEvent,
  ToolCallEndEvent,
  TokenUsage
} from './types/events';
```

## Testing

Run unit tests:

```bash
npm run test -- tests/truncator.test.mjs
```

## Benefits

1. **Token Efficiency**: Truncation prevents context overflow
2. **Observability**: 20+ event types for comprehensive tracking
3. **Consistency**: Unified tool execution with standard error handling
4. **Performance**: Track execution time, identify slow tools
5. **Debugging**: Detailed event log for troubleshooting
6. **UX**: Real-time progress updates via events

## Migration from Old Code

**Before**:
```javascript
// Old: Direct tool execution
const result = await runTool(toolCall);
messages.push({ role: 'tool', content: result });
```

**After**:
```javascript
// New: With truncation, events, error handling
const executor = createExecutor({ ... });
const result = await executor.execute(toolCall, context);
messages.push({ role: 'tool', content: result.content });

// Events automatically emitted:
// - tool_call_begin
// - tool_call_end (or tool_call_error)
```

## Next Steps

See [FORGEKEEPER_ENHANCEMENT_ARCHITECTURE.md](../../../docs/FORGEKEEPER_ENHANCEMENT_ARCHITECTURE.md) for:
- Phase 2: Review Mode & Self-Evaluation
- Phase 3: History Compaction
- Phase 4+: Advanced features

## References

- [Codex Architecture](../../../docs/FORGEKEEPER_ENHANCEMENT_ARCHITECTURE.md)
- [Event Types Reference](../../types/events.d.ts)
- [ADR-0001: ContextLog](../../../docs/contextlog/adr-0001-contextlog.md)
