# T208 DiagnosticsDrawer UI Guide

## Visual Layout

### Main Drawer Structure
```
┌─────────────────────────────────────────────────────────────┐
│ Diagnostics — Recent Events                            ✕   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ▼ Tool Executions (5)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Tool         │ Status │ Time    │ Preview              │ │
│ │ read_file    │ done   │ 234ms   │ File contents: ...   │ │
│ │ write_file   │ done   │ 156ms   │ Wrote 1024 bytes     │ │
│ │ bash_command │ error  │ 45ms    │ Command not found    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ▼ Review History (3)                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Pass 1  ✗                          234ms  [Copy JSON]   │ │
│ │ Score: 0.650 / 0.70  ████████░░░░░░                     │ │
│ │ ▶ Show Critique                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Pass 2  ✓                          287ms  [Copy JSON]   │ │
│ │ Score: 0.785 / 0.70  ████████████████░░                 │ │
│ │ ▼ Hide Critique                                         │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ Good improvement on clarity. The response now       │ │ │
│ │ │ includes specific examples and better structure.    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Pass 3  ✓                          198ms  [Copy JSON]   │ │
│ │ Score: 0.842 / 0.70  ████████████████████░              │ │
│ │ ▶ Show Critique                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ▼ Chunk Breakdown (4)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Outline (4 chunks)                                      │ │
│ │ Introduction → Analysis → Examples → Conclusion        │ │
│ │ Generated in 145ms                                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Chunk 1/4: Introduction           2.3s    [Copy JSON]  │ │
│ │ Reasoning: 150 tokens  Content: 300 tokens             │ │
│ │ Total: 450 tokens                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Chunk 2/4: Analysis               3.1s    [Copy JSON]  │ │
│ │ Reasoning: 200 tokens  Content: 450 tokens             │ │
│ │ Total: 650 tokens                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Chunk 3/4: Examples               2.8s    [Copy JSON]  │ │
│ │ Reasoning: 175 tokens  Content: 380 tokens             │ │
│ │ Total: 555 tokens                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Chunk 4/4: Conclusion             1.9s    [Copy JSON]  │ │
│ │ Reasoning: 120 tokens  Content: 250 tokens             │ │
│ │ Total: 370 tokens                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ▶ Continuations (2)                                        │
│                                                             │
│ ▶ All Events (12)                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Review Pass Cards

**Score Colors:**
- 🟢 Green (`#52c41a`): Score >= threshold (accepted)
  ```
  Score: 0.785 / 0.70  ████████████████░░
  ```

- 🟡 Yellow (`#faad14`): Score < threshold but > threshold - 0.2 (close)
  ```
  Score: 0.680 / 0.70  ███████████████░░░
  ```

- 🔴 Red (`#ff4d4f`): Score < threshold - 0.2 (far from threshold)
  ```
  Score: 0.450 / 0.70  ██████░░░░░░░░░░░░
  ```

**Status Indicators:**
- ✓ (Green circle): Accepted
- ✗ (Red circle): Rejected

### Chunk Cards

**Token Colors:**
- 🟣 Purple (`#7c3aed`): Reasoning tokens
- 🔵 Blue (`#0369a1`): Content tokens
- ⚫ Gray (`#334155`): Total tokens

### Section Backgrounds

- Tool Executions: Light blue (`#e6f7ff`) with blue border (`#91d5ff`)
- Review History: White cards (`#fff`) with gray border (`#e2e8f0`)
- Chunk Outline: Light blue (`#f0f9ff`) with sky border (`#bae6fd`)
- Chunk Cards: White cards (`#fff`) with gray border (`#e2e8f0`)
- Continuations: Light yellow (`#fffbe6`) with yellow border (`#ffe58f`)

## Component Breakdown

### 1. CollapsibleSection
```typescript
<CollapsibleSection
  title="Review History"
  count={3}
  defaultOpen={true}
>
  {/* Content */}
</CollapsibleSection>
```

**Features:**
- Click to expand/collapse
- Arrow indicator: ▼ (open) or ▶ (closed)
- Shows item count in parentheses
- Gray background header with hover effect

### 2. ReviewPassCard

```typescript
<ReviewPassCard event={reviewCycleEvent} />
```

**Visual Elements:**
1. Header row:
   - Pass number (bold)
   - Status badge (✓ or ✗)
   - Elapsed time (right)
   - Copy button (right)

2. Score row:
   - Label: "Score: "
   - Value: 0.785 (bold, colored)
   - Threshold: "/ 0.70"
   - Progress bar (colored)

3. Critique section:
   - Toggle button: "▶ Show Critique" / "▼ Hide Critique"
   - Expandable text area
   - Preview (200 chars) when collapsed

### 3. ChunkCard

```typescript
<ChunkCard event={chunkWriteEvent} totalChunks={4} />
```

**Visual Elements:**
1. Header row:
   - Chunk label: "Chunk 2/4: Analysis" (bold)
   - Elapsed time in seconds (right)
   - Copy button (right)

2. Token stats row:
   - Reasoning tokens (purple)
   - Content tokens (blue)
   - Total tokens (gray)

### 4. CopyButton

```typescript
<CopyButton data={eventObject} label="Copy JSON" />
```

**States:**
- Default: Gray background, "Copy JSON"
- Clicked: Green background, "✓ Copied" (2 seconds)
- Error: Silent fail with console warning

## Interaction Flow

### Opening the Drawer
1. User clicks "Diagnostics" button in chat UI
2. Drawer slides in from center
3. Three parallel API calls fetch data:
   - Tool events
   - Review events
   - Chunk events
4. Loading indicators show during fetch
5. Sections populate as data arrives

### Collapsing Sections
1. User clicks section header
2. Arrow rotates: ▼ → ▶ or ▶ → ▼
3. Content animates in/out
4. ARIA state updates: `aria-expanded="true/false"`

### Expanding Critiques
1. User clicks "Show Critique" button
2. Button text changes to "Hide Critique"
3. Critique text expands with pre-wrap formatting
4. Button text changes arrow: ▶ → ▼

### Copying Event Data
1. User clicks "Copy JSON" button
2. Event data serialized to JSON (2-space indent)
3. Copied to clipboard
4. Button shows "✓ Copied" feedback
5. After 2 seconds, reverts to "Copy JSON"

### Closing the Drawer
1. User clicks:
   - ✕ button in header
   - Outside drawer area (overlay)
   - Escape key
2. Drawer closes with fade animation

## Accessibility Features

### Keyboard Navigation
- **Tab**: Move to next interactive element
- **Shift+Tab**: Move to previous interactive element
- **Enter/Space**: Activate button (expand/collapse/copy)
- **Escape**: Close drawer

### Screen Reader Support
- Drawer: `role="dialog" aria-modal="true"`
- Close button: `aria-label="Close"`
- Collapsible sections: `aria-expanded="true/false"`
- Status indicators: `title="Accepted/Rejected"`
- All interactive elements have clear labels

### Visual Accessibility
- High contrast colors
- Large clickable areas (min 44x44px)
- Clear focus indicators
- Color not sole indicator (uses ✓/✗ symbols)

## Responsive Design

### Desktop (>900px)
- Drawer width: 900px
- Full feature set visible

### Tablet (600-900px)
- Drawer width: 94vw
- Scrollable content
- Maintained functionality

### Mobile (<600px)
- Drawer width: 94vw
- Max height: 80vh
- Touch-friendly buttons
- Scrollable sections

## Empty States

### No Tool Events
- Section hidden
- No visual indicator

### No Review Events
- Section hidden
- Check console for loading errors

### No Chunk Events
- Section hidden
- Check console for loading errors

### No Events at All
- Shows only "All Events" section
- Table displays empty rows

## Loading States

### Initial Load
```
▼ Review History
Loading...
```

### After Load Success
```
▼ Review History (3)
[Review pass cards]
```

### After Load Error
```
▼ Review History (0)
[Empty]
```
Console: "Failed to fetch review events: [error]"

## Sample JSON Output

### Review Event Copy
```json
{
  "id": "evt_abc123",
  "ts": "2025-11-16T12:34:56.789Z",
  "actor": "system",
  "act": "review_cycle",
  "conv_id": "conv_xyz",
  "trace_id": "trace_123",
  "iter": 1,
  "name": "self_review",
  "status": "ok",
  "review_pass": 2,
  "quality_score": 0.785,
  "threshold": 0.7,
  "accepted": true,
  "critique": "Good improvement on clarity and structure.",
  "elapsed_ms": 234
}
```

### Chunk Event Copy
```json
{
  "id": "evt_def456",
  "ts": "2025-11-16T12:35:00.123Z",
  "actor": "assistant",
  "act": "chunk_write",
  "conv_id": "conv_xyz",
  "trace_id": "trace_123",
  "iter": 2,
  "name": "write_chunk",
  "status": "ok",
  "chunk_index": 1,
  "chunk_label": "Introduction",
  "reasoning_tokens": 150,
  "content_tokens": 300,
  "elapsed_ms": 2300
}
```

## Performance Notes

- **Initial Load**: ~200-500ms (3 parallel API calls)
- **Section Expand**: Instant (client-side state)
- **Copy Action**: <50ms (clipboard API)
- **Drawer Open/Close**: Smooth (CSS transitions)

## Browser Compatibility

- Chrome 90+: Full support
- Firefox 88+: Full support
- Safari 14+: Full support
- Edge 90+: Full support

**Required APIs:**
- Clipboard API (navigator.clipboard)
- CSS Grid/Flexbox
- ES6+ JavaScript
- React 18+

---

**Document Version:** 1.0
**Last Updated:** 2025-11-16
**Related Task:** T208
