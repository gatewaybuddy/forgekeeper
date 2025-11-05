# Phase 2: Meta-Cognition Enhancement - COMPLETE ✅

**Date**: 2025-10-31
**Status**: Implemented and Committed
**Commit**: `fbd0de5`

## What Was Implemented

Phase 2 ("Meta-Cognition") dramatically enhances the agent's ability to **critique its own reasoning** and **learn from prediction accuracy** through three key improvements:

---

## 🧠 **Enhancement 1: Meta-Reflection Loop**

### **What It Does**:
Agent examines its **previous reflection** and compares predictions to **actual outcomes**.

### **Before**:
```
Iteration 3: Agent predicts 60% progress with 0.9 confidence
Iteration 4: Actually 15% progress, action failed
Iteration 5: Agent has NO AWARENESS of prediction error
            Makes similarly overconfident prediction again
```

### **After**:
```
Iteration 3: Agent predicts 60% progress with 0.9 confidence
Iteration 4: Actually 15% progress, action failed

  🔍 META-REFLECTION:
     **Progress Estimate**:
     - I predicted: 60%
     - Actual progress: 15%
     - Error: 45% ⚠️ SIGNIFICANT ERROR - I was too optimistic

     **Confidence Calibration**:
     - I was 90% confident
     - Action FAILED
     - ⚠️ OVERCONFIDENT - I was 90% sure but failed. Reduce confidence.

     **What I Should Learn**:
     - My reasoning led to failure. This approach didn't work.
       Try a fundamentally different strategy.

     **Overall Reflection Accuracy**: 28%

Iteration 5: Agent sees meta-critique in reflection prompt
            Adjusts confidence and progress estimates
            More cautious predictions
```

### **Key Methods**:

#### **`scoreReflectionAccuracy(previousReflection, actualOutcome)`**
Compares prediction to reality:

```javascript
{
  progress_error: 45,           // |predicted - actual| %
  confidence_error: 0.8,        // 0.8 = overconfident
  assessment_correct: false,    // predicted 'continue', was 'stuck'
  overall_accuracy: 28          // 0-100% accuracy score
}
```

**Scoring Logic**:
- **Progress Accuracy**: `100 - abs(predicted - actual)`
- **Confidence Error**:
  - High confidence + failure = 0.8 (overconfident)
  - Low confidence + success = 0.3 (underconfident)
  - Well calibrated = 0.1
- **Overall**: `(progress * 0.4) + (confidence * 0.3) + (assessment * 0.3)`

#### **`metaReflect(previousReflection, actualOutcome, scores)`**
Generates critique text:

```markdown
## 🔍 Meta-Reflection: Critiquing My Previous Reasoning

### Last Iteration's Prediction vs Reality

**Progress Estimate**:
- I predicted: 60%
- Actual progress: 15%
- Error: 45% ⚠️ SIGNIFICANT ERROR - I was too optimistic

**Confidence Calibration**:
- I was 90% confident
- Action FAILED
- ⚠️ OVERCONFIDENT - Reduce confidence for similar actions.

**My Previous Reasoning**:
"I think http_fetch will work because the repository is public..."

**What I Should Learn**:
- HTTP/fetch approach was wrong for this task. Use shell commands instead.

**Overall Reflection Accuracy**: 28%
```

#### **`buildMetaReflectionGuidance()`**
Shows accuracy track record:

```markdown
## 📊 My Prediction Accuracy Track Record

Recent reflection accuracy:
- Iteration 3: 28% accuracy (progress estimate off by 45%)
- Iteration 4: 52% accuracy
- Iteration 5: 71% accuracy ✓

**Average Accuracy**: 50%

⚠️ **LOW ACCURACY** - My predictions have been poor. I need to:
- Be more careful with progress estimates
- Reduce confidence when trying new approaches
- Think more critically about what can go wrong
```

### **Impact**:
- Agent **sees WHY** previous predictions failed
- Agent **learns** from overconfidence/underconfidence patterns
- Agent **adjusts** future predictions based on track record
- Agent becomes **better calibrated** over iterations

---

## 🎯 **Enhancement 2: Planning Feedback Loop**

### **What It Does**:
Agent tracks **task planner accuracy** by comparing planned steps to actual execution.

### **Before**:
```
Planner: "Use http_fetch → get README → parse" (confidence: 0.9)
Execution: Failed, switched to run_bash instead
Next Planning: Planner has NO IDEA previous plan failed
               Makes same overconfident plan again
```

### **After**:
```
Planner: "Use http_fetch → get README → parse" (confidence: 0.9)
Execution: Failed, switched to run_bash instead

🎯 PLANNING FEEDBACK:
   Plan failed. Wrong tools: http_fetch.
   Actual tools used: run_bash.
   Planner was overconfident - high confidence but execution failed.

Next Planning: Agent sees feedback
  📊 Task Planner Track Record:
     - Iteration 3: ✗ FAILED (confidence: 90%)
       Plan failed. Wrong tools: http_fetch.
     - Success Rate: 33% (1/3)

     ⚠️ POOR CALIBRATION - Planner is overconfident.
     Reduce reliance on high-confidence plans.
```

### **Key Methods**:

#### **`scorePlanningAccuracy(instructionPlan, executionResult)`**
Compares plan to execution:

```javascript
{
  planConfidence: 0.9,              // Planner's confidence
  planSucceeded: false,             // Did execution work?
  stepsPlanned: 3,                  // Number of steps planned
  stepsExecuted: 1,                 // Number actually used
  toolsMatchedPlan: 0,              // 0/3 tools matched
  confidenceCalibration: 0.2,       // 0.2 = overconfident
  analysis: "Plan failed. Wrong tools: http_fetch. Actual: run_bash."
}
```

**Confidence Calibration**:
- High confidence (>0.7) + success = 1.0 (well calibrated)
- High confidence + failure = 0.2 (overconfident)
- Low confidence + success = 0.5 (underconfident)
- Low confidence + failure = 0.8 (appropriately cautious)

#### **`buildPlanningFeedbackGuidance()`**
Shows planner track record:

```markdown
## 🎯 Task Planner Track Record

Recent planning accuracy:
- Iteration 3: ✗ FAILED (confidence: 90%) - 0/3 tools matched plan
  Plan failed. Wrong tools: http_fetch. Actual tools used: run_bash.
- Iteration 4: ✓ SUCCESS (confidence: 85%) - 2/2 tools matched plan
  Plan was accurate - all tools used as planned and succeeded.
- Iteration 5: ✓ SUCCESS (confidence: 70%) - 3/3 tools matched plan

**Success Rate**: 67% (2/3)

⚠️ **POOR CALIBRATION** - Planner is overconfident.
Reduce reliance on high-confidence plans.
```

### **Impact**:
- Agent **learns** which plan predictions work vs fail
- Agent **sees** planner's overconfidence patterns
- Agent **adjusts** reliance on high-confidence plans
- Agent becomes **less trusting** of overconfident predictions

---

## 🔄 **Enhancement 3: Integration into Main Loop**

### **State Tracking**:
Added to agent state:

```javascript
{
  reflectionAccuracy: [
    {
      iteration: 3,
      overall_accuracy: 28,
      progress_error: 45,
      confidence_error: 0.8,
      wasOverconfident: true,
      metaCritique: "🔍 Meta-Reflection: ..."
    }
  ],
  lastReflection: {
    progress_percent: 60,
    confidence: 0.9,
    reasoning: "I think http_fetch will work..."
  },
  planningFeedback: [
    {
      iteration: 3,
      planConfidence: 0.9,
      planSucceeded: false,
      analysis: "Plan failed. Wrong tools..."
    }
  ]
}
```

### **Main Loop Integration**:

```javascript
// After execution (lines 320-368)
if (this.state.lastReflection) {
  // Score accuracy
  const scores = this.scoreReflectionAccuracy(lastReflection, actualOutcome);

  // Generate critique
  const metaCritique = this.metaReflect(lastReflection, actualOutcome, scores);

  // Store for next reflection
  this.state.reflectionAccuracy.push({ ...scores, metaCritique });

  // Log to ContextLog
  await contextLogEvents.emit({ type: 'meta_reflection', ... });
}

// After planning (lines 375-413)
if (executionResult.instructionPlan) {
  // Score planning accuracy
  const feedback = this.scorePlanningAccuracy(plan, executionResult);

  // Store for next reflection
  this.state.planningFeedback.push(feedback);

  // Log to ContextLog
  await contextLogEvents.emit({ type: 'planning_feedback', ... });
}
```

### **Reflection Prompt Integration** (lines 1573-1592):

```javascript
const metaReflectionText = this.buildMetaReflectionGuidance();
const planningFeedbackText = this.buildPlanningFeedbackGuidance();
const lastCritique = this.state.reflectionAccuracy.length > 0
  ? this.state.reflectionAccuracy[this.state.reflectionAccuracy.length - 1].metaCritique
  : '';

return `# Autonomous Task - Self-Assessment
...
${learningsText}
${preferencesText}
${episodesText}
${successPatternsText}
${lastCritique}              // ← Shows last iteration's critique
${metaReflectionText}        // ← Shows accuracy track record
${planningFeedbackText}      // ← Shows planner track record
...
`;
```

---

## 📊 **Behavioral Changes**

### **Scenario: Clone Repository Task**

#### **Before Phase 2**:
```
Iteration 1: Predict 60% progress, try http_fetch → FAIL
Iteration 2: Predict 60% progress, try http_fetch again → FAIL
Iteration 3: Predict 60% progress, try http_fetch third time → FAIL
Iteration 4: Finally try run_bash → SUCCESS
Agent never realizes predictions were wrong
```

#### **After Phase 2**:
```
Iteration 1: Predict 60% progress, confidence 0.9
            Try http_fetch → FAIL

  🔍 META-REFLECTION (Iteration 2):
     - Progress error: 45% (predicted 60%, actual 15%)
     - Overconfident: 90% sure but failed
     - Lesson: HTTP approach didn't work

  📊 Accuracy: 28% - LOW ACCURACY warning shown

  🎯 PLANNING FEEDBACK:
     - Plan failed. Wrong tools: http_fetch
     - Planner overconfident (90% confidence)

Iteration 2: Agent sees warnings in reflection
            Reduces confidence to 0.5
            Predicts 20% progress (more realistic)
            Tries different tool (run_bash)
            → SUCCESS

  🔍 META-REFLECTION (Iteration 3):
     - Progress error: 5% (predicted 20%, actual 25%)
     - Well calibrated: 50% confidence, succeeded
     - Lesson: run_bash approach worked

  📊 Accuracy: 85% - GOOD ACCURACY

Iteration 3: Agent reinforces successful approach
```

---

## 📈 **Technical Details**

### **Files Changed**: `frontend/core/agent/autonomous.mjs`

### **Key Code Additions**:

1. **Lines 133-136**: State initialization
   ```javascript
   reflectionAccuracy: [],
   lastReflection: null,
   planningFeedback: [],
   ```

2. **Lines 320-368**: Meta-reflection integration
   ```javascript
   if (this.state.lastReflection) {
     const scores = this.scoreReflectionAccuracy(...);
     const critique = this.metaReflect(...);
     this.state.reflectionAccuracy.push({ ...scores, critique });
   }
   this.state.lastReflection = reflection;
   ```

3. **Lines 375-413**: Planning feedback integration
   ```javascript
   if (executionResult.instructionPlan) {
     const feedback = this.scorePlanningAccuracy(...);
     this.state.planningFeedback.push(feedback);
   }
   ```

4. **Lines 1757-1882**: Meta-reflection methods
   - `scoreReflectionAccuracy()`
   - `metaReflect()`
   - `buildMetaReflectionGuidance()`

5. **Lines 2009-2118**: Planning feedback methods
   - `scorePlanningAccuracy()`
   - `buildPlanningFeedbackGuidance()`

6. **Lines 1573-1592**: Integration into reflection prompt
   ```javascript
   ${lastCritique}${metaReflectionText}${planningFeedbackText}
   ```

7. **Line 887**: Include instruction plan in execution result
   ```javascript
   return { ..., instructionPlan: planningUsed ? instructionPlan : null };
   ```

### **New ContextLog Events**:

#### **Meta-Reflection Event**:
```json
{
  "type": "meta_reflection",
  "session_id": "...",
  "iteration": 3,
  "overall_accuracy": 28,
  "progress_error": 45,
  "confidence_error": 0.8,
  "assessment_correct": false,
  "critique_preview": "🔍 Meta-Reflection: I predicted 60% but..."
}
```

#### **Planning Feedback Event**:
```json
{
  "type": "planning_feedback",
  "session_id": "...",
  "iteration": 3,
  "plan_succeeded": false,
  "plan_confidence": 0.9,
  "tools_matched": 0,
  "steps_planned": 3,
  "confidence_calibration": 0.2,
  "analysis": "Plan failed. Wrong tools: http_fetch..."
}
```

---

## 🧪 **How to Test**

### **Test 1: Verify Meta-Reflection**

1. Start autonomous task that will fail then succeed:
   ```
   "Clone repository from https://github.com/user/repo"
   ```

2. Agent tries approach that fails (e.g., http_fetch)

3. Check logs (`/api/ctx/tail.json?session_id=...`):
   ```json
   {
     "type": "meta_reflection",
     "overall_accuracy": 28,
     "progress_error": 45
   }
   ```

4. Look at next iteration's reflection prompt:
   Should include:
   ```
   🔍 Meta-Reflection: Critiquing My Previous Reasoning
   - I predicted: 60%
   - Actual progress: 15%
   - Error: 45% ⚠️ SIGNIFICANT ERROR
   ```

### **Test 2: Verify Planning Feedback**

1. Start task that uses task planner

2. Check if instruction plan was generated (logs show `planning_phase` event)

3. After execution, check for `planning_feedback` event:
   ```json
   {
     "type": "planning_feedback",
     "plan_succeeded": false,
     "plan_confidence": 0.9,
     "analysis": "Plan failed..."
   }
   ```

4. Next reflection should show:
   ```
   🎯 Task Planner Track Record
   - Iteration 3: ✗ FAILED (confidence: 90%)
   ```

### **Test 3: Verify Accuracy Track Record**

1. Let agent run for 5+ iterations

2. Check reflection prompt includes:
   ```
   📊 My Prediction Accuracy Track Record
   Recent reflection accuracy:
   - Iteration 3: 28% accuracy
   - Iteration 4: 52% accuracy
   - Iteration 5: 71% accuracy

   Average Accuracy: 50%
   ```

3. Should show appropriate warnings (LOW/MODERATE/GOOD)

### **Test 4: Verify Behavioral Change**

1. Start task known to cause overconfident predictions

2. Observe agent behavior:
   - **Early iterations**: High confidence, wrong predictions
   - **After meta-reflection**: Lower confidence, more realistic
   - **Accuracy improvement**: Should trend upward over iterations

---

## 📈 **Expected Improvements**

### **Quantitative**:
- **Meta-reflection tracking**: 0 → 5 iterations (new capability)
- **Planning feedback tracking**: 0 → 5 iterations (new capability)
- **Accuracy awareness**: 0% → 100% (agent now sees own accuracy)
- **Lines of reasoning context**: 200 → 600 chars (3x increase)

### **Qualitative**:
- ✅ Agent critiques own predictions
- ✅ Agent learns from overconfidence patterns
- ✅ Agent sees planner success/failure rates
- ✅ Better calibrated future predictions
- ✅ Reduced repetition of failed approaches
- ✅ More realistic progress estimates
- ✅ Appropriate confidence levels

---

## 🚀 **Next Steps: Phase 3 (Cross-Session Learning)**

Now that Phase 2 is complete, Phase 3 will add:

### **1. Tool Effectiveness Database**
Track tool success rates by task type:
```javascript
{
  "clone_repository": {
    "run_bash": { successRate: 0.95, avgIterations: 1.2 },
    "http_fetch": { successRate: 0.05, avgIterations: 3.5 }
  }
}
```

### **2. Aggregate Pattern Learning**
Learn from **many sessions** instead of just current session:
```
"For 'clone repository' tasks:
 - run_bash succeeds 95% of time (12/13 sessions)
 - http_fetch succeeds 5% of time (1/20 sessions)
 → STRONG RECOMMENDATION: Use run_bash, avoid http_fetch"
```

### **3. Automatic Strategy Selection**
Choose best approach based on **historical data**:
```
Task: "Clone repository X"
Historical Data: run_bash 95% success for this task type
Agent: "I will use run_bash based on strong historical evidence"
Result: SUCCESS on first try (no exploration needed)
```

**Estimated Time**: 2-3 hours for Phase 3 implementation

---

## 💡 **Key Insight**

**Phase 2 Achievement**: Moved from **reflective** to **meta-cognitive**

- **Phase 1**: Agent reflects on its own reasoning and learns from success
- **Phase 2**: Agent **critiques** its own reflections and predictions
- **Phase 3** (planned): Agent learns **across sessions** from aggregate data

This creates a **recursive loop**:
1. Agent makes prediction
2. Agent executes action
3. Agent compares prediction to reality ← **Phase 2**
4. Agent critiques why prediction was wrong ← **Phase 2**
5. Agent adjusts future predictions ← **Phase 2**
6. Go to step 1 (now better calibrated)

The agent is now **self-correcting** through recursive examination of its own reasoning!

---

## ✅ **Summary**

Phase 2 is **COMPLETE** and **COMMITTED** (`fbd0de5`).

The autonomous agent now:
- ✅ Tracks reflection accuracy over 5 iterations (new capability)
- ✅ Critiques own predictions vs actual outcomes (new capability)
- ✅ Scores planning accuracy (new capability)
- ✅ Shows accuracy track records in reflections (new capability)
- ✅ Learns from overconfidence/underconfidence patterns (new capability)
- ✅ Provides concrete calibration warnings (new capability)

**Impact**: Agent can now **critique its own reasoning**, learn from prediction errors, and become **better calibrated** over time.

**Ready for Phase 3**: Cross-session learning, tool effectiveness database, automatic strategy selection!
