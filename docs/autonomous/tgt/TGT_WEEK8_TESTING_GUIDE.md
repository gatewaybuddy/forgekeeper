# TGT Week 8 - Manual Testing Guide

**Purpose**: Verify Week 8 features are working correctly
**Time**: 15-20 minutes
**Prerequisites**: Frontend server running (`npm run dev` in `frontend/`)

---

## Quick Verification Checklist

### ✅ Step 1: Verify TypeScript Compilation (30 sec)
```bash
cd frontend
npm run typecheck
```
**Expected**: No errors, clean compilation

---

### ✅ Step 2: Run Smoke Tests (1 min)
```bash
cd frontend
npm test tgt-week8.smoke.test.mjs
```
**Expected**: All tests pass (4 suites, 35+ assertions)

---

### ✅ Step 3: Test Task Lifecycle Funnel (3 min)

#### API Test
```bash
curl http://localhost:3000/api/tasks/funnel?daysBack=7 | jq
```

**Expected Response**:
```json
{
  "funnel": {
    "period": { "daysBack": 7, "totalTasks": X },
    "stages": {
      "generated": { "count": X, "percentage": 100 },
      "engaged": { "count": Y, "percentage": Z },
      "approved": { "count": A, "percentage": B },
      "completed": { "count": C, "percentage": D },
      "dismissed": { "count": E, "percentage": F }
    },
    "conversionRates": {
      "generatedToEngaged": { "rate": X },
      "engagedToApproved": { "rate": Y },
      "approvedToCompleted": { "rate": Z }
    },
    "summary": {
      "healthScore": 72,
      "topIssue": "...",
      "recommendation": "..."
    }
  }
}
```

#### UI Test
1. Open `http://localhost:3000`
2. Navigate to **Tasks → Analytics** tab
3. Look for **Task Lifecycle Funnel** section
4. Verify:
   - ✅ Funnel chart displays with 5 stages
   - ✅ Health score shows (0-100)
   - ✅ Recommendation text appears
   - ✅ Time range selector works (7/14/30 days)

---

### ✅ Step 4: Test Smart Auto-Approval (5 min)

#### Enable Auto-Approval
Edit `.env`:
```bash
TASKGEN_AUTO_APPROVE=1
TASKGEN_AUTO_APPROVE_CONFIDENCE=0.9
TASKGEN_AUTO_APPROVE_ANALYZERS=continuation,error_spike
TASKGEN_AUTO_APPROVE_MAX_PER_HOUR=5
```

#### Check Stats
```bash
curl http://localhost:3000/api/tasks/auto-approval/stats | jq
```

**Expected Response**:
```json
{
  "config": {
    "enabled": true,
    "minConfidence": 0.9,
    "trustedAnalyzers": ["continuation", "error_spike"],
    "maxPerHour": 5
  },
  "stats": {
    "approvalsThisHour": 0,
    "remainingQuota": 5,
    "rateLimitReset": null
  }
}
```

#### Trigger Auto-Approval
1. Generate a high-confidence task (confidence ≥ 0.9)
2. Wait 5 seconds
3. Check task status via API or UI
4. Verify:
   - ✅ Task status = "approved"
   - ✅ UI shows "⚡ Auto-Approved" badge
   - ✅ Approved within 5 seconds of generation

---

### ✅ Step 5: Test Task Templates (4 min)

#### List Templates
```bash
curl http://localhost:3000/api/tasks/templates | jq
```

**Expected**: 5 built-in templates
- `template_error_spike`
- `template_docs_gap`
- `template_performance`
- `template_ux_issue`
- `template_continuation`

#### Create Task from Template
```bash
curl -X POST http://localhost:3000/api/tasks/from-template/template_error_spike \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "error_type": "NullPointerException",
      "component": "UserService",
      "magnitude": "15",
      "time_window": "last 2 hours"
    }
  }' | jq
```

**Expected Response**:
```json
{
  "task": {
    "id": "...",
    "title": "Fix NullPointerException spike in UserService",
    "description": "An error spike has been detected in UserService.\n\nError Type: NullPointerException\nSpike Magnitude: 15x normal rate\nTime Window: last 2 hours",
    "analyzer": "template",
    "confidence": 1.0,
    ...
  }
}
```

#### UI Test
1. Open Tasks drawer
2. Click **"Create from Template"**
3. Select a template
4. Fill in variables
5. Preview task
6. Click **"Create Task"**
7. Verify task created successfully

---

### ✅ Step 6: Test Batch Operations (4 min)

#### Batch Approve
```bash
# First, get some task IDs
TASK_IDS=$(curl -s http://localhost:3000/api/tasks?status=generated | jq -r '.tasks[:3] | .[].id')

# Batch approve
curl -X POST http://localhost:3000/api/tasks/batch/approve \
  -H "Content-Type: application/json" \
  -d "{\"taskIds\": [\"$TASK_ID_1\", \"$TASK_ID_2\", \"$TASK_ID_3\"]}" | jq
```

**Expected Response**:
```json
{
  "message": "Batch approval completed",
  "results": {
    "succeeded": [
      { "taskId": "...", "title": "..." },
      { "taskId": "...", "title": "..." }
    ],
    "failed": [],
    "notFound": []
  },
  "summary": {
    "total": 3,
    "succeeded": 3,
    "failed": 0,
    "notFound": 0
  }
}
```

#### UI Test
1. Open Tasks drawer
2. Check multiple task checkboxes
3. Click **"✓ Approve Selected (X)"**
4. Confirm in modal
5. Verify:
   - ✅ Success notification appears
   - ✅ Selected tasks now have status "approved"
   - ✅ Selection cleared

#### Batch Dismiss
```bash
curl -X POST http://localhost:3000/api/tasks/batch/dismiss \
  -H "Content-Type: application/json" \
  -d "{\"taskIds\": [\"$TASK_ID_1\"], \"reason\": \"Test dismissal\"}" | jq
```

---

## Common Issues & Solutions

### Issue 1: TypeScript Errors
**Symptom**: `tsc --noEmit` shows errors
**Solution**: Run `npm install` in `frontend/` to ensure dependencies are up to date

### Issue 2: Funnel Shows No Data
**Symptom**: Funnel API returns empty stages
**Solution**:
- Generate some test tasks first
- Try longer time range (30 days instead of 7)
- Check `.forgekeeper/tasks/generated_tasks.jsonl` exists

### Issue 3: Auto-Approval Not Working
**Symptom**: Tasks not getting auto-approved
**Solution**:
1. Check `.env` has `TASKGEN_AUTO_APPROVE=1`
2. Restart frontend server after changing `.env`
3. Verify task confidence ≥ 0.9
4. Check analyzer is in trusted list
5. Verify rate limit not exceeded (max 5/hour)

### Issue 4: Template Variables Not Replacing
**Symptom**: Task shows `{variable}` instead of value
**Solution**:
- Check variable names match exactly (case-sensitive)
- Ensure `variables` object provided in API request
- Verify template exists: `GET /api/tasks/templates/:id`

### Issue 5: Batch Operation Fails
**Symptom**: Batch approve/dismiss returns errors
**Solution**:
- Check batch size ≤ 100 tasks
- Verify all task IDs exist
- Ensure tasks are in correct status (generated for approve, etc.)
- Review response `failed` array for specific reasons

---

## Regression Testing

After verifying Week 8, also test these existing features to ensure no regressions:

### Week 7: Analytics Dashboard
- [ ] Analytics tab renders
- [ ] Time-series charts display
- [ ] Recommendations appear

### Week 6: Advanced Features
- [ ] Real-time task updates via SSE
- [ ] Browser notifications work
- [ ] Keyboard shortcuts (j/k/a/d/space)
- [ ] Search/filtering functional

### Week 5: Real-time Updates
- [ ] SSE connection established
- [ ] Tasks update in real-time
- [ ] Connection status indicator shows "Real-time"

---

## Performance Checks

### API Response Times
- ✅ `/api/tasks/funnel` < 100ms for 1000 tasks
- ✅ `/api/tasks/templates` < 50ms
- ✅ `/api/tasks/batch/approve` < 500ms for 20 tasks

### UI Responsiveness
- ✅ Funnel chart renders in < 1 second
- ✅ Template selector opens in < 500ms
- ✅ Multi-select checkbox responsive (no lag)

---

## Sign-Off Checklist

- [ ] TypeScript compilation passes
- [ ] All smoke tests pass
- [ ] Funnel visualization renders correctly
- [ ] Auto-approval works for high-confidence tasks
- [ ] Templates create tasks successfully
- [ ] Batch approve/dismiss functional
- [ ] No regressions in Weeks 1-7
- [ ] API response times acceptable
- [ ] UI is responsive

**If all checked**: ✅ Week 8 is production-ready!

---

## Next Steps After Verification

1. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat(tgt): Week 8 complete - Task Lifecycle & Automation"
   ```

2. **Update Project Roadmap**:
   - Mark Week 8 as complete
   - Plan Week 9 (Integration & Testing)

3. **Monitor in Production**:
   - Watch auto-approval rate
   - Track funnel health score
   - Monitor template usage
   - Review batch operation patterns

---

**Testing Complete!** 🎉

For detailed feature documentation, see `docs/WEEK_8_TGT_ENHANCEMENTS.md`.
