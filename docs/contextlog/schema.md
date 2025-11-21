# ContextLog Event Schema Reference

## Overview

ContextLog uses a flexible JSON event format with a base schema and event-specific extensions. All events are stored in JSONL (JSON Lines) format with one event per line.

## Base Event Schema

Every ContextLog event includes these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique event ID (UUID v4) |
| `ts` | string | Yes | ISO-8601 timestamp (UTC) |
| `actor` | string | Yes | Actor type: `user`, `assistant`, `tool`, `system` |
| `act` | string | Yes | Action type (see Event Types below) |
| `conv_id` | string | No | Conversation ID for grouping related events |
| `trace_id` | string | No | Trace ID for distributed tracing |
| `iter` | number | No | Iteration number within a conversation |
| `name` | string | No | Specific name of the action or tool |
| `status` | string | No | Event status: `ok`, `error`, `warning` |

## Event Types by Category

### 1. Review Events (`act: "review_cycle"`)

Self-review iteration events from M2 quality improvement.

**Additional Fields:**
- `review_pass` (number): Which review pass this is (1, 2, 3...)
- `quality_score` (number): Score from 0.0-1.0
- `threshold` (number): Quality threshold to pass (0.0-1.0)
- `critique` (string): Truncated critique text (max 500 chars)
- `accepted` (boolean): Whether response was accepted
- `elapsed_ms` (number): Time taken for review pass

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ts": "2025-11-21T10:30:00.000Z",
  "actor": "system",
  "act": "review_cycle",
  "conv_id": "conv-123",
  "trace_id": "trace-456",
  "iter": 2,
  "name": "self_review",
  "status": "ok",
  "review_pass": 1,
  "quality_score": 0.85,
  "threshold": 0.7,
  "critique": "Response is comprehensive but could be more concise...",
  "accepted": true,
  "elapsed_ms": 1250
}
```

### 2. Regeneration Events (`act: "regeneration"`)

When a response is regenerated based on critique.

**Additional Fields:**
- `attempt` (number): Regeneration attempt number
- `reason` (string): Reason for regeneration (max 500 chars)
- `previous_score` (number): Score before regeneration

**Example:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "ts": "2025-11-21T10:30:05.000Z",
  "actor": "assistant",
  "act": "regeneration",
  "conv_id": "conv-123",
  "trace_id": "trace-456",
  "iter": 2,
  "name": "regenerate_with_critique",
  "status": "ok",
  "attempt": 1,
  "reason": "Improve conciseness and clarity",
  "previous_score": 0.65,
  "elapsed_ms": 3400
}
```

### 3. Review Summary Events (`act: "review_summary"`)

Summary of entire review process.

**Additional Fields:**
- `total_passes` (number): Total number of review passes
- `final_score` (number): Final quality score
- `regeneration_count` (number): Number of regenerations
- `accepted` (boolean): Final acceptance status
- `total_elapsed_ms` (number): Total time for all review

**Example:**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "ts": "2025-11-21T10:30:10.000Z",
  "actor": "system",
  "act": "review_summary",
  "conv_id": "conv-123",
  "trace_id": "trace-456",
  "iter": 2,
  "name": "review_complete",
  "status": "ok",
  "total_passes": 3,
  "final_score": 0.85,
  "regeneration_count": 1,
  "accepted": true,
  "total_elapsed_ms": 8900
}
```

### 4. Chunk Outline Events (`act: "chunk_outline"`)

Outline generation for chunked reasoning.

**Additional Fields:**
- `chunk_count` (number): Number of chunks planned
- `outline` (array): Array of chunk labels
- `raw_outline` (string): Raw outline text (max 1000 chars)
- `elapsed_ms` (number): Time to generate outline

**Example:**
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "ts": "2025-11-21T10:35:00.000Z",
  "actor": "system",
  "act": "chunk_outline",
  "conv_id": "conv-124",
  "trace_id": "trace-457",
  "iter": 0,
  "name": "generate_outline",
  "status": "ok",
  "chunk_count": 3,
  "outline": ["Introduction", "Implementation Details", "Conclusion"],
  "raw_outline": "1. Introduction\n2. Implementation Details\n3. Conclusion",
  "elapsed_ms": 800
}
```

### 5. Chunk Write Events (`act: "chunk_write"`)

Individual chunk generation.

**Additional Fields:**
- `chunk_index` (number): Zero-based chunk index
- `chunk_label` (string): Chunk label (max 100 chars)
- `reasoning_tokens` (number): Tokens used for reasoning
- `content_tokens` (number): Tokens used for content
- `elapsed_ms` (number): Time to write chunk

**Example:**
```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "ts": "2025-11-21T10:35:05.000Z",
  "actor": "assistant",
  "act": "chunk_write",
  "conv_id": "conv-124",
  "trace_id": "trace-457",
  "iter": 1,
  "name": "write_chunk",
  "status": "ok",
  "chunk_index": 0,
  "chunk_label": "Introduction",
  "reasoning_tokens": 120,
  "content_tokens": 450,
  "elapsed_ms": 2100
}
```

### 6. Chunk Assembly Events (`act: "chunk_assembly"`)

Assembly of all chunks into final response.

**Additional Fields:**
- `chunk_count` (number): Total chunks assembled
- `total_reasoning_tokens` (number): Sum of reasoning tokens
- `total_content_tokens` (number): Sum of content tokens
- `total_tokens` (number): Grand total tokens
- `elapsed_ms` (number): Assembly time

**Example:**
```json
{
  "id": "aa0e8400-e29b-41d4-a716-446655440005",
  "ts": "2025-11-21T10:35:20.000Z",
  "actor": "system",
  "act": "chunk_assembly",
  "conv_id": "conv-124",
  "trace_id": "trace-457",
  "iter": 3,
  "name": "assemble_chunks",
  "status": "ok",
  "chunk_count": 3,
  "total_reasoning_tokens": 380,
  "total_content_tokens": 1850,
  "total_tokens": 2230,
  "elapsed_ms": 50
}
```

### 7. Combined Mode Events

**`act: "combined_mode_start"`**

Starting combined review + chunked mode.

**Additional Fields:**
- `strategy` (string): Strategy used (`review_first`, `review_chunks`, `both`)
- `chunk_count` (number): Number of chunks planned

**`act: "combined_mode_complete"`**

Completing combined mode.

**Additional Fields:**
- `strategy` (string): Strategy used
- `chunk_count` (number): Chunks processed
- `total_review_passes` (number): Total review passes
- `final_score` (number): Final quality score
- `total_elapsed_ms` (number): Total time

### 8. Tool Execution Events

**`act: "tool_execution_start"`**

Tool execution begins.

**Additional Fields:**
- `args_preview` (string): Tool arguments preview (max 500 chars)

**`act: "tool_execution_finish"`**

Tool execution completes successfully.

**Additional Fields:**
- `result_preview` (string): Tool result preview (max 500 chars)
- `elapsed_ms` (number): Execution time
- `bytes` (number): Result size in bytes

**`act: "tool_execution_error"`**

Tool execution error.

**Additional Fields:**
- `error` (string): Error message (max 500 chars)
- `error_type` (string): Error category
- `elapsed_ms` (number): Time before error

**Example:**
```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "ts": "2025-11-21T10:40:00.000Z",
  "actor": "tool",
  "act": "tool_execution_finish",
  "conv_id": "conv-125",
  "trace_id": "trace-458",
  "iter": 0,
  "name": "read_file",
  "status": "ok",
  "result_preview": "File contents: Lorem ipsum dolor sit amet...",
  "elapsed_ms": 45,
  "bytes": 2048
}
```

## Storage Format

### File Naming

Files follow the pattern:
```
.forgekeeper/context_log/ctx-YYYYMMDD-HH.jsonl
.forgekeeper/context_log/ctx-YYYYMMDD-HH-1.jsonl  # Rotation suffix
```

Examples:
- `ctx-20251121-10.jsonl` - Events from 2025-11-21 10:00-10:59 UTC
- `ctx-20251121-10-1.jsonl` - Overflow when first file exceeds size limit

### Rotation

- **Size-based**: New file created when current file exceeds `FGK_CONTEXTLOG_MAX_BYTES` (default: 10MB)
- **Time-based**: New file created hourly (UTC hour boundary)
- **Retention**: Files older than `FGK_CONTEXTLOG_RETENTION_DAYS` (default: 7 days) are automatically deleted

### Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `FGK_CONTEXTLOG_DIR` | `.forgekeeper/context_log` | Storage directory |
| `FGK_CONTEXTLOG_MAX_BYTES` | `10485760` (10MB) | Max file size before rotation |
| `FGK_CONTEXTLOG_RETENTION_DAYS` | `7` | Days to retain old logs |

## Querying Events

### Node.js (server.contextlog.mjs)

```javascript
import { tailEvents } from './server.contextlog.mjs';

// Get last 50 events
const events = tailEvents(50);

// Filter by conversation ID
const convEvents = tailEvents(100, 'conv-123');
```

### Python (forgekeeper/services/context_log/jsonl.py)

```python
from forgekeeper.services.context_log import jsonl

# Get last 50 events
events = jsonl.tail(50)

# Filter by conversation ID
conv_events = jsonl.tail(100, conv_id='conv-123')
```

### REST API

```bash
# Get last 50 events (default)
curl http://localhost:3000/api/ctx/tail

# Get last 100 events
curl http://localhost:3000/api/ctx/tail?n=100

# Filter by conversation ID
curl http://localhost:3000/api/ctx/tail?conv_id=conv-123

# Pretty-printed JSON
curl http://localhost:3000/api/ctx/tail.json

# Cleanup old logs
curl -X POST http://localhost:3000/api/ctx/cleanup

# Get stats
curl http://localhost:3000/api/ctx/stats
```

## Data Truncation

To keep events compact, certain fields are truncated:

| Field | Max Length | Suffix |
|-------|-----------|--------|
| `critique` | 500 chars | `...` |
| `reason` | 500 chars | `...` |
| `raw_outline` | 1000 chars | `...` |
| `chunk_label` | 100 chars | `...` |
| `args_preview` | 500 chars | `...` |
| `result_preview` | 500 chars | `...` |
| `error` | 500 chars | `...` |

Full data is available in the application memory; only storage is truncated.

## Performance Considerations

### In-Memory Caching

Both Node and Python implementations cache recent events in memory to reduce disk I/O:

- **Node**: `tailCache` Map stores parsed events by file
- **Python**: File-based iteration without explicit cache

### Best Practices

1. **Query by conversation ID** when possible to reduce parsing
2. **Limit result count** with `n` parameter (default: 50, max: 10,000)
3. **Use cleanup endpoint** periodically to manage disk usage
4. **Monitor stats** via `/api/ctx/stats` to track growth

## Version History

- **2025-11-21**: Added retention and cleanup functionality
- **2025-11-14**: Added combined mode events
- **2025-11**: Added chunked reasoning events
- **2025-10**: Added review and tool execution events
- **2025-09**: Initial base schema

---

For implementation details, see:
- ADR-0001: `docs/adr/adr-0001-contextlog.md`
- Node implementation: `frontend/server.contextlog.mjs`
- Python implementation: `forgekeeper/services/context_log/jsonl.py`
