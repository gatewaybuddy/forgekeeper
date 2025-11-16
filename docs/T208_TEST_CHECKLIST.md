# T208 Testing Checklist

## Pre-Test Setup

### Environment Configuration
- [ ] Backend server running on port 3000
- [ ] Frontend dev server running on port 5173 (or production build on 3000)
- [ ] Environment variables set:
  - [ ] `FRONTEND_REVIEW_ENABLED=1`
  - [ ] `FRONTEND_CHUNKED_ENABLED=1`
  - [ ] `FGK_CONTEXTLOG_DIR` points to valid directory
- [ ] ContextLog directory exists and is writable

### Initial Verification
- [ ] Navigate to http://localhost:5173 (or http://localhost:3000)
- [ ] UI loads without console errors
- [ ] Chat interface is visible
- [ ] Mode controls (Review/Chunked) are visible

## Unit Tests

### Code Quality
- [x] ESLint passes for DiagnosticsDrawer.tsx
- [x] ESLint passes for ctxClient.ts
- [x] TypeScript compilation succeeds
- [x] No unused imports or variables
- [x] All function parameters are used

### Type Safety
- [x] CtxEvent includes all event types
- [x] ReviewCycleEvent extends CtxEvent correctly
- [x] ChunkOutlineEvent extends CtxEvent correctly
- [x] ChunkWriteEvent extends CtxEvent correctly
- [x] fetchContextEvents returns Promise<CtxEvent[]>

## Integration Tests

### 1. Basic Drawer Functionality
- [ ] Click "Diagnostics" button in chat UI
- [ ] Drawer opens and displays
- [ ] Header shows "Diagnostics — Recent Events"
- [ ] Close button (✕) is visible
- [ ] Click close button → drawer closes
- [ ] Click outside drawer → drawer closes
- [ ] Press Escape key → drawer closes

### 2. Tool Executions Section
- [ ] Send message that triggers tool calls (e.g., "List files in current directory")
- [ ] Open diagnostics drawer
- [ ] "Tool Executions" section is visible
- [ ] Section shows count (e.g., "Tool Executions (5)")
- [ ] Table displays:
  - [ ] Tool names
  - [ ] Status badges (colored: green/yellow/red)
  - [ ] Elapsed time in ms
  - [ ] Preview text
- [ ] Click section header → section collapses
- [ ] Click section header again → section expands
- [ ] Arrow indicator changes (▼ ↔ ▶)

### 3. Review History Section

#### Without Review Events
- [ ] Disable review mode
- [ ] Send normal message
- [ ] Open diagnostics drawer
- [ ] "Review History" section does NOT appear

#### With Review Events
- [ ] Enable review mode in UI
- [ ] Configure review settings:
  - [ ] Quality threshold: 0.70
  - [ ] Max passes: 3
- [ ] Send message: "Write a detailed explanation of photosynthesis"
- [ ] Wait for review cycles to complete
- [ ] Open diagnostics drawer
- [ ] "Review History" section appears
- [ ] Section shows count (e.g., "Review History (3)")

#### Review Pass Cards
For each review pass:
- [ ] Pass number displayed (e.g., "Pass 2")
- [ ] Status indicator shows:
  - [ ] ✓ (green) if accepted
  - [ ] ✗ (red) if rejected
- [ ] Elapsed time shown in ms
- [ ] "Copy JSON" button visible

#### Score Display
- [ ] Score value displayed with 3 decimal places
- [ ] Threshold value displayed with 2 decimal places
- [ ] Format: "Score: X.XXX / Y.YY"
- [ ] Progress bar visible
- [ ] Progress bar width matches score/threshold ratio
- [ ] Color coding correct:
  - [ ] Green if score >= threshold
  - [ ] Yellow if score close to threshold (within 0.2)
  - [ ] Red if score far from threshold (>0.2 below)

#### Critique Functionality
- [ ] "Show Critique" button visible when collapsed
- [ ] Preview text shown (200 char max) with "..." if truncated
- [ ] Click "Show Critique" → full critique displays
- [ ] Button changes to "Hide Critique"
- [ ] Click "Hide Critique" → critique collapses
- [ ] Full critique preserves whitespace/formatting

#### Copy Functionality
- [ ] Click "Copy JSON" button
- [ ] Button shows "✓ Copied" feedback
- [ ] Button is green for 2 seconds
- [ ] Paste clipboard content
- [ ] Valid JSON structure
- [ ] Contains all event fields:
  - [ ] id, ts, actor, act
  - [ ] review_pass, quality_score, threshold
  - [ ] accepted, critique, elapsed_ms
- [ ] After 2 seconds, button reverts to "Copy JSON"

### 4. Chunk Breakdown Section

#### Without Chunk Events
- [ ] Disable chunked mode
- [ ] Send normal message
- [ ] Open diagnostics drawer
- [ ] "Chunk Breakdown" section does NOT appear

#### With Chunk Events
- [ ] Enable chunked mode in UI
- [ ] Configure chunk settings:
  - [ ] Max chunks: 4
- [ ] Send message: "Write a comprehensive guide to quantum computing"
- [ ] Wait for chunked generation to complete
- [ ] Open diagnostics drawer
- [ ] "Chunk Breakdown" section appears
- [ ] Section shows count (e.g., "Chunk Breakdown (4)")

#### Outline Display
- [ ] Outline box visible at top
- [ ] Title shows "Outline (N chunks)"
- [ ] Chunk labels separated by " → "
- [ ] Light blue background (#f0f9ff)
- [ ] Generation time shown in ms

#### Chunk Cards
For each chunk:
- [ ] Chunk index/total displayed (e.g., "Chunk 2/4")
- [ ] Chunk label displayed (e.g., "Introduction")
- [ ] Elapsed time shown in seconds (e.g., "2.3s")
- [ ] "Copy JSON" button visible

#### Token Display
- [ ] "Reasoning: X tokens" shown in purple
- [ ] "Content: Y tokens" shown in blue
- [ ] "Total: Z tokens" shown in gray
- [ ] Total = reasoning + content

#### Copy Functionality
- [ ] Click "Copy JSON" button on chunk card
- [ ] Button shows "✓ Copied" feedback
- [ ] Paste clipboard content
- [ ] Valid JSON structure
- [ ] Contains all event fields:
  - [ ] id, ts, actor, act
  - [ ] chunk_index, chunk_label
  - [ ] reasoning_tokens, content_tokens
  - [ ] elapsed_ms

### 5. Continuations Section
- [ ] Send message that triggers auto-continuation
- [ ] Open diagnostics drawer
- [ ] "Continuations" section appears (if events exist)
- [ ] Section collapsed by default
- [ ] Click to expand → shows continuation events
- [ ] Shows counts: total, short, punct, fence
- [ ] "Copy last 50 events" button works

### 6. All Events Section
- [ ] "All Events" section always present
- [ ] Section collapsed by default
- [ ] Click to expand → shows event table
- [ ] Table columns: ts, actor, act, name, preview, ms
- [ ] All events from props displayed
- [ ] Scrollable if >400px height

## Accessibility Tests

### Keyboard Navigation
- [ ] Tab through drawer elements
- [ ] All interactive elements receive focus
- [ ] Focus indicators visible
- [ ] Enter/Space activates buttons
- [ ] Escape closes drawer

### Screen Reader
- [ ] Drawer announces as dialog
- [ ] "Diagnostics — Recent Events" announced as heading
- [ ] Section states announced (expanded/collapsed)
- [ ] Button labels clear ("Copy JSON", "Show Critique", etc.)
- [ ] Status indicators have titles ("Accepted", "Rejected")

### Visual Accessibility
- [ ] All text readable (min 12px font)
- [ ] Sufficient color contrast (WCAG AA)
- [ ] Color not sole indicator (uses ✓/✗ symbols)
- [ ] Clickable areas large enough (44x44px minimum)
- [ ] Focus indicators visible on all interactive elements

## Edge Cases

### No Events
- [ ] Open drawer with no events in props
- [ ] Only "All Events" section visible
- [ ] Table shows empty body
- [ ] No errors in console

### Single Event Type
- [ ] Only tool events exist → only Tool section shows
- [ ] Only review events exist → only Review section shows
- [ ] Only chunk events exist → only Chunk section shows

### Missing Fields
- [ ] Review event without critique → no critique section
- [ ] Chunk event without tokens → no token display
- [ ] Event without elapsed_ms → shows "-"
- [ ] No console errors for missing fields

### Long Content
- [ ] Very long critique (>1000 chars) → scrollable when expanded
- [ ] Very long chunk label → truncates gracefully
- [ ] Many events (>50) → scrollable sections
- [ ] Preview text truncates properly

### Rapid Interactions
- [ ] Rapidly click expand/collapse → no visual glitches
- [ ] Rapidly click copy buttons → no errors
- [ ] Open/close drawer quickly → no memory leaks

### Concurrent Events
- [ ] Review and chunk events in same conversation
- [ ] Both sections display
- [ ] No interference between sections
- [ ] Events properly separated

## Performance Tests

### Load Time
- [ ] Drawer opens in <500ms
- [ ] Three API calls complete in <1s total
- [ ] No janky animations
- [ ] Smooth scrolling

### Memory Usage
- [ ] Open/close drawer 10 times
- [ ] No memory leaks (check browser dev tools)
- [ ] No excessive re-renders (check React dev tools)

### Large Data Sets
- [ ] 100+ events in All Events section
- [ ] Scrolling is smooth
- [ ] No layout shift
- [ ] No browser lag

## Browser Compatibility

### Chrome
- [ ] All features work
- [ ] Clipboard API works
- [ ] Styles render correctly

### Firefox
- [ ] All features work
- [ ] Clipboard API works
- [ ] Styles render correctly

### Safari
- [ ] All features work
- [ ] Clipboard API works
- [ ] Styles render correctly

### Edge
- [ ] All features work
- [ ] Clipboard API works
- [ ] Styles render correctly

## Mobile/Responsive

### Tablet (768px)
- [ ] Drawer width: 94vw
- [ ] All sections visible
- [ ] Touch targets large enough
- [ ] Scrolling works

### Mobile (375px)
- [ ] Drawer width: 94vw
- [ ] Max height: 80vh
- [ ] Sections stack properly
- [ ] Touch targets large enough
- [ ] Horizontal scroll not needed

## Error Handling

### API Failures
- [ ] Tool events API fails → section hidden, console warning
- [ ] Review events API fails → section hidden, console warning
- [ ] Chunk events API fails → section hidden, console warning
- [ ] No crash or UI freeze

### Clipboard Failures
- [ ] Clipboard API not available
- [ ] Copy fails silently
- [ ] Console warning shown
- [ ] No user-facing error

### Malformed Data
- [ ] Event missing required fields
- [ ] Event with wrong types
- [ ] Event with null/undefined values
- [ ] Component handles gracefully
- [ ] No crashes

## Regression Tests

### Existing Functionality
- [ ] Tool Executions section still works as before
- [ ] Continuations section still works as before
- [ ] All Events table still works as before
- [ ] Chat UI not affected
- [ ] Other drawers/panels not affected

### Performance
- [ ] No slowdown in chat interactions
- [ ] No increase in bundle size (>10%)
- [ ] No new console warnings/errors

## Sign-Off

### Developer Checklist
- [x] Code follows style guide
- [x] TypeScript types complete
- [x] No lint errors
- [x] Build succeeds
- [x] Documentation complete

### QA Checklist
- [ ] All test scenarios executed
- [ ] Edge cases verified
- [ ] Accessibility verified
- [ ] Performance acceptable
- [ ] No regressions found

### Product Checklist
- [ ] Meets requirements in task card
- [ ] UI matches design spec
- [ ] User experience smooth
- [ ] Ready for production

---

**Test Status:** Ready for Testing
**Tester:** _____________
**Date:** _____________
**Result:** [ ] PASS [ ] FAIL
**Notes:** _____________________________________________
