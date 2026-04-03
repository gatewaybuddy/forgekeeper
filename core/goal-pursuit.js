// Goal Pursuit Engine - Strategic planning, progress tracking, adaptive evaluation
// Evaluates goals periodically, runs retrospectives at period boundaries,
// computes urgency, and feeds goal health into reflection context.
import { config } from '../config.js';
import { goals, tasks } from './memory.js';
import { query, getCallsLastHour, isApiRateLimited } from './claude.js';
import { nudge } from './inner-life.js';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { getPersonalityPath } from './identity.js';
import { rotateIfNeeded } from './jsonl-rotate.js';

const EVAL_JOURNAL_PATH = join(getPersonalityPath(), 'journal/goal_evaluations.jsonl');

// --- Urgency computation (pure math, no API) ---

export function computeUrgency(goal) {
  if (!goal.deadline && !goal.recurring) return 0;

  const now = Date.now();
  let start, end;

  if (goal.recurring) {
    start = new Date(goal.recurring.currentStart).getTime();
    end = new Date(goal.recurring.currentEnd).getTime();
  } else {
    start = new Date(goal.created).getTime();
    end = new Date(goal.deadline).getTime();
  }

  if (end <= start) return 0;

  const totalTime = end - start;
  const elapsed = now - start;
  const timeRatio = Math.min(elapsed / totalTime, 1.0);

  if (!goal.progress || !goal.progress.target) {
    return Math.min(timeRatio, 1.0);
  }

  const progressRatio = goal.progress.current / goal.progress.target;
  const deficit = timeRatio - progressRatio;

  // Lumpy progress (e.g. income goals) — dampened escalation curve.
  // Linear: deficit * 2 (hits 1.0 at 0.5 deficit)
  // Lumpy: deficit * 1.2 (hits 1.0 at ~0.83 deficit) — stays calmer because
  // big jumps in progress are expected and urgency whiplash is noise.
  const scale = goal.progressPattern === 'lumpy' ? 1.2 : 2;
  return Math.max(0, Math.min(deficit * scale, 1.0));
}

export function getUrgencyLabel(urgency) {
  const t = config.goalPursuit?.urgencyThresholds || { low: 0.3, medium: 0.6, high: 0.8, critical: 0.95 };
  if (urgency >= t.critical) return 'critical';
  if (urgency >= t.high) return 'high';
  if (urgency >= t.medium) return 'medium';
  if (urgency >= t.low) return 'low';
  return 'none';
}

// --- Period math ---

function computePeriodMs(period) {
  switch (period) {
    case 'daily': return 24 * 60 * 60 * 1000;
    case 'weekly': return 7 * 24 * 60 * 60 * 1000;
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    case 'quarterly': return 90 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

function daysRemaining(goal) {
  const now = Date.now();
  let end;
  if (goal.recurring) {
    end = new Date(goal.recurring.currentEnd).getTime();
  } else if (goal.deadline) {
    end = new Date(goal.deadline).getTime();
  } else {
    return null;
  }
  return Math.max(0, Math.round((end - now) / (24 * 60 * 60 * 1000)));
}

// --- Journal ---

function recordEvaluation(entry) {
  try {
    appendFileSync(EVAL_JOURNAL_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }) + '\n');
    rotateIfNeeded(EVAL_JOURNAL_PATH);
  } catch (e) {
    console.error('[GoalPursuit] Failed to write journal:', e.message);
  }
}

// --- Task summary for goal ---

function getGoalTaskSummary(goal) {
  const goalTasks = (goal.tasks || []).map(id => tasks.get(id)).filter(Boolean);
  const completed = goalTasks.filter(t => t.status === 'completed');
  const failed = goalTasks.filter(t => t.status === 'failed');
  const pending = goalTasks.filter(t => t.status === 'pending' || t.status === 'active');

  return {
    tasks: goalTasks,
    completed,
    failed,
    pending,
    summary: `${completed.length} completed, ${failed.length} failed, ${pending.length} pending`,
  };
}

// --- Resource pool: find goals competing for the same resource ---

function getCompetingGoals(goal) {
  if (!goal.resourcePool) return [];
  return goals.active().filter(g => g.id !== goal.id && g.resourcePool === goal.resourcePool);
}

function formatCompetingGoals(goal) {
  const competing = getCompetingGoals(goal);
  if (competing.length === 0) return '';
  // Show top 3 by urgency to avoid noisy prompts with many competing goals
  const sorted = competing.sort((a, b) => computeUrgency(b) - computeUrgency(a));
  const top = sorted.slice(0, 3);
  const lines = top.map(g => {
    const u = computeUrgency(g);
    const p = g.progress?.target ? `${g.progress.current}/${g.progress.target}` : 'no target';
    return `- ${g.description} (progress: ${p}, urgency: ${getUrgencyLabel(u)})`;
  }).join('\n');
  const overflow = competing.length > 3 ? `\n(+${competing.length - 3} more goals on this resource)` : '';
  return `\nCompeting goals (same resource pool "${goal.resourcePool}"):\n${lines}${overflow}\nConsider tradeoffs when suggesting tasks — these goals share the same scarce resource.`;
}

// --- Main loop integration ---

export async function checkGoalEvaluations() {
  if (!config.goalPursuit?.enabled) return;
  if (isApiRateLimited()) return;

  const now = Date.now();
  const evalIntervalMs = (config.goalPursuit.evalIntervalHours || 24) * 60 * 60 * 1000;
  const staleDays = config.triggers?.checkStaleGoalsDays || 3;
  const staleMs = staleDays * 24 * 60 * 60 * 1000;

  // Collect all goals that need attention: deadline goals + stale deadline-less goals
  const deadlineGoals = goals.withDeadlines();
  const staleGoals = goals.active()
    .filter(g => !g.deadline && !g.recurring) // no deadline
    .filter(g => (now - new Date(g.updated).getTime()) > staleMs); // stale

  const allGoals = [...deadlineGoals, ...staleGoals];
  if (allGoals.length === 0) return;

  // Sort by urgency descending — most at-risk goals get evaluated first (budget-aware)
  allGoals.sort((a, b) => computeUrgency(b) - computeUrgency(a));

  // Budget: don't exceed evalBudgetPct of hourly calls
  const maxCalls = config.guardrails?.maxClaudeCallsPerHour || 100;
  const budgetLimit = Math.floor(maxCalls * (config.goalPursuit.evalBudgetPct || 0.10));
  const callsUsed = getCallsLastHour();

  for (const goal of allGoals) {
    // Recompute urgency (pure math) and persist if changed
    const newUrgency = computeUrgency(goal);
    if (Math.abs((goal.urgency || 0) - newUrgency) > 0.01) {
      goals.update(goal.id, { urgency: newUrgency });
      console.log(`[GoalPursuit] Urgency: ${goal.description?.slice(0, 40)} → ${newUrgency.toFixed(2)} (${getUrgencyLabel(newUrgency)})`);
    }

    // Budget check before API calls
    if (callsUsed >= budgetLimit) {
      console.log(`[GoalPursuit] Budget limit reached (${callsUsed}/${budgetLimit}), skipping API evaluations`);
      break;
    }

    // Check if recurring period has ended → retrospective
    if (goal.recurring && now > new Date(goal.recurring.currentEnd).getTime()) {
      await retrospective(goal);
      continue;
    }

    // Check if evaluation is due
    const lastEval = goal.evaluations?.[goal.evaluations.length - 1];
    const lastEvalTime = lastEval ? new Date(lastEval.timestamp).getTime() : 0;
    if (now - lastEvalTime > evalIntervalMs) {
      await evaluateGoal(goal);
    }
  }
}

// --- Evaluate a goal (1 API call) ---

export async function evaluateGoal(goal) {
  console.log(`[GoalPursuit] Evaluating: ${goal.description?.slice(0, 60)}`);

  const taskSummary = getGoalTaskSummary(goal);
  const days = daysRemaining(goal);
  const urgency = computeUrgency(goal);
  const urgencyLabel = getUrgencyLabel(urgency);

  const progressStr = goal.progress?.target
    ? `${goal.progress.current}/${goal.progress.target} ${goal.progress.unit || ''}`
    : 'no numeric target';

  const lastEvals = (goal.evaluations || []).slice(-2).map(e => e.narrative || e.summary || '').join('\n');

  const taskLines = taskSummary.tasks.map(t =>
    `- [${t.status}] ${t.description?.slice(0, 80)}`
  ).join('\n');

  const competingContext = formatCompetingGoals(goal);

  const prompt = `You are evaluating progress on a goal.

Goal: ${goal.description}
${goal.success_criteria ? `Success criteria: ${goal.success_criteria}` : ''}
Current progress: ${progressStr}
Days remaining: ${days !== null ? days : 'no deadline'}
Urgency: ${urgency.toFixed(2)} (${urgencyLabel})
${goal.strategy ? `Current strategy: ${goal.strategy}` : ''}

Tasks:
${taskLines || '(no tasks)'}

${lastEvals ? `Recent evaluations:\n${lastEvals}` : ''}${competingContext}

Evaluate this goal's progress. Respond with:
- [PROGRESS: <number>] if you can estimate current progress toward the target
- [STRATEGY: <text>] if the strategy should change or be clarified
- [CREATE_TASK: <description>] for any new tasks needed (can include multiple)
- [GOAL_STATUS: completed] if the goal has been achieved
- [GOAL_STATUS: failed] if the goal is no longer achievable
Then write 2-3 sentences of evaluation narrative.`;

  try {
    const result = await query(prompt);
    if (!result.success || !result.output?.trim()) {
      console.error('[GoalPursuit] Evaluation query failed:', result.error);
      return;
    }

    const raw = result.output.trim();
    parseAndApplyEvaluation(goal, raw, 'evaluation');
    nudge('goal evaluated');
  } catch (e) {
    console.error('[GoalPursuit] Evaluation error:', e.message);
  }
}

// --- Retrospective (1 API call, at period boundary) ---

export async function retrospective(goal) {
  console.log(`[GoalPursuit] Retrospective: ${goal.description?.slice(0, 60)}`);

  const taskSummary = getGoalTaskSummary(goal);
  const urgency = computeUrgency(goal);

  const progressStr = goal.progress?.target
    ? `${goal.progress.current}/${goal.progress.target} ${goal.progress.unit || ''}`
    : 'no numeric target';

  const completedTasks = taskSummary.completed.map(t => {
    const lastAttempt = t.attempts?.[t.attempts.length - 1];
    return `- [completed] ${t.description?.slice(0, 80)} → ${lastAttempt?.output?.slice(0, 100) || 'done'}`;
  }).join('\n');

  const failedTasks = taskSummary.failed.map(t => {
    const lastAttempt = t.attempts?.[t.attempts.length - 1];
    return `- [failed] ${t.description?.slice(0, 80)} → ${lastAttempt?.error?.slice(0, 100) || 'unknown error'}`;
  }).join('\n');

  const prevRetro = (goal.evaluations || [])
    .filter(e => e.type === 'retrospective')
    .slice(-1)[0];

  const competingContext = formatCompetingGoals(goal);

  // Pre-compute how many periods were missed (system offline, late check)
  // so Claude doesn't misinterpret zero progress as strategic failure
  let skippedPeriodsCount = 0;
  if (goal.recurring) {
    const periodMs = computePeriodMs(goal.recurring.period);
    let checkEnd = new Date(new Date(goal.recurring.currentEnd).getTime() + periodMs).toISOString();
    while (new Date(checkEnd).getTime() < Date.now()) {
      skippedPeriodsCount++;
      checkEnd = new Date(new Date(checkEnd).getTime() + periodMs).toISOString();
    }
  }
  const downtimeNote = skippedPeriodsCount > 0
    ? `\nNote: ${skippedPeriodsCount} period(s) were skipped due to system downtime. Zero progress during those periods is NOT a strategic failure — the system was offline.\n`
    : '';

  const prompt = `You are conducting a period-end retrospective on a goal.

Goal: ${goal.description}
${goal.success_criteria ? `Success criteria: ${goal.success_criteria}` : ''}
Progress this period: ${progressStr}
${goal.strategy ? `Strategy used: ${goal.strategy}` : ''}${competingContext}${downtimeNote}

Completed tasks this period:
${completedTasks || '(none)'}

Failed tasks this period:
${failedTasks || '(none)'}

${prevRetro ? `Previous retrospective:\n${prevRetro.narrative || prevRetro.summary || ''}` : ''}

This period has ended. Review what happened and plan the next period.
- [PERIOD_PROGRESS: <number>] progress made THIS period
- [WHAT_WORKED: <text>] strategies/actions that produced results
- [WHAT_FAILED: <text>] what didn't work
- [NEXT_STRATEGY: <text>] strategy for the new period
- [CREATE_TASK: <description>] initial tasks for the new period
Then write a brief retrospective (3-5 sentences).`;

  try {
    const result = await query(prompt);
    if (!result.success || !result.output?.trim()) {
      console.error('[GoalPursuit] Retrospective query failed:', result.error);
      return;
    }

    const raw = result.output.trim();

    // Parse retrospective-specific directives
    const nextStrategyMatch = raw.match(/\[NEXT_STRATEGY:\s*(.+?)\]/);
    const whatWorkedMatch = raw.match(/\[WHAT_WORKED:\s*(.+?)\]/);
    const whatFailedMatch = raw.match(/\[WHAT_FAILED:\s*(.+?)\]/);
    const periodProgressMatch = raw.match(/\[PERIOD_PROGRESS:\s*(\d+(?:\.\d+)?)\]/);

    // Apply evaluation directives (progress, tasks, status)
    parseAndApplyEvaluation(goal, raw, 'retrospective', {
      whatWorked: whatWorkedMatch?.[1],
      whatFailed: whatFailedMatch?.[1],
      periodProgress: periodProgressMatch ? parseFloat(periodProgressMatch[1]) : undefined,
    });

    // Roll period forward — catch up through any missed periods (system offline, late check)
    if (goal.recurring) {
      const periodMs = computePeriodMs(goal.recurring.period);
      let curStart = goal.recurring.currentStart;
      let curEnd = goal.recurring.currentEnd;
      const progressHistory = [...(goal.progress?.history || [])];
      let skippedPeriods = 0;

      // Record the just-ended period's progress
      if (goal.progress?.target) {
        progressHistory.push({
          period: `${curStart} to ${curEnd}`,
          achieved: goal.progress.current,
          target: goal.progress.target,
        });
      }

      // Advance through any fully-elapsed periods
      let newStart = curEnd;
      let newEnd = new Date(new Date(curEnd).getTime() + periodMs).toISOString();
      while (new Date(newEnd).getTime() < Date.now()) {
        // This entire period was missed — record a skip
        skippedPeriods++;
        progressHistory.push({
          period: `${newStart} to ${newEnd}`,
          achieved: 0,
          target: goal.progress?.target || 0,
          skipped: true,
        });
        newStart = newEnd;
        newEnd = new Date(new Date(newEnd).getTime() + periodMs).toISOString();
      }

      if (skippedPeriods > 0) {
        console.log(`[GoalPursuit] Caught up through ${skippedPeriods} missed period(s)`);
      }

      const updates = {
        recurring: { ...goal.recurring, currentStart: newStart, currentEnd: newEnd },
      };
      if (nextStrategyMatch) {
        updates.strategy = nextStrategyMatch[1];
      }
      if (goal.progress?.target) {
        updates.progress = { ...goal.progress, current: 0, history: progressHistory };
      }
      goals.update(goal.id, updates);
      console.log(`[GoalPursuit] Period rolled: ${newStart} to ${newEnd}`);
    }

    nudge('goal retrospective');
  } catch (e) {
    console.error('[GoalPursuit] Retrospective error:', e.message);
  }
}

// --- Shared evaluation parser ---

function parseAndApplyEvaluation(goal, raw, type, extra = {}) {
  // Parse directives
  const progressMatch = raw.match(/\[PROGRESS:\s*(\d+(?:\.\d+)?)\]/);
  const strategyMatch = raw.match(/\[STRATEGY:\s*(.+?)\]/);
  const statusMatch = raw.match(/\[GOAL_STATUS:\s*(completed|failed)\]/);
  const taskDirectives = [];
  raw.replace(/\[CREATE_TASK:\s*(.+?)\]/g, (_, desc) => {
    taskDirectives.push(desc.trim());
    return '';
  });

  // Strip directives for narrative
  const narrative = raw
    .replace(/\[PROGRESS:\s*\d+(?:\.\d+)?\]/g, '')
    .replace(/\[STRATEGY:\s*.+?\]/g, '')
    .replace(/\[GOAL_STATUS:\s*(?:completed|failed)\]/g, '')
    .replace(/\[CREATE_TASK:\s*.+?\]/g, '')
    .replace(/\[PERIOD_PROGRESS:\s*\d+(?:\.\d+)?\]/g, '')
    .replace(/\[WHAT_WORKED:\s*.+?\]/g, '')
    .replace(/\[WHAT_FAILED:\s*.+?\]/g, '')
    .replace(/\[NEXT_STRATEGY:\s*.+?\]/g, '')
    .trim();

  const updates = {};

  // Update progress
  if (progressMatch && goal.progress?.target) {
    const newValue = parseFloat(progressMatch[1]);
    updates.progress = {
      ...goal.progress,
      current: newValue,
      history: [...(goal.progress.history || []), {
        timestamp: new Date().toISOString(),
        value: newValue,
        source: type,
      }],
    };
  }

  // Update strategy
  if (strategyMatch) {
    updates.strategy = strategyMatch[1];
  }

  // Record evaluation, with pruning to prevent unbounded growth.
  // Strategy: keep all retrospectives (period-over-period learning),
  // the first 5 evaluations (initial strategy pivots, early mistakes),
  // and the 25 most recent regular evaluations. Full history lives
  // in the JSONL journal via recordEvaluation() + rotateIfNeeded().
  const MAX_EVALUATIONS = 50;
  const KEEP_FIRST = 5;
  const KEEP_RECENT = 25;
  const evaluation = {
    timestamp: new Date().toISOString(),
    type,
    narrative,
    urgency: computeUrgency(goal),
    ...extra,
  };
  let allEvals = [...(goal.evaluations || []), evaluation];
  if (allEvals.length > MAX_EVALUATIONS) {
    const retrospectives = allEvals.filter(e => e.type === 'retrospective');
    const regular = allEvals.filter(e => e.type !== 'retrospective');
    const first = regular.slice(0, KEEP_FIRST);
    const recent = regular.slice(-KEEP_RECENT);
    // Deduplicate in case first and recent overlap (goal is still young)
    const kept = new Map();
    for (const e of [...first, ...recent]) {
      kept.set(e.timestamp, e);
    }
    allEvals = [...retrospectives, ...kept.values()].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }
  updates.evaluations = allEvals;

  // Apply updates
  goals.update(goal.id, updates);

  // Handle goal status changes
  if (statusMatch) {
    if (statusMatch[1] === 'completed') {
      goals.complete(goal.id, narrative);
      console.log(`[GoalPursuit] Goal completed: ${goal.description?.slice(0, 60)}`);
    } else if (statusMatch[1] === 'failed') {
      goals.fail(goal.id, narrative);
      console.log(`[GoalPursuit] Goal failed: ${goal.description?.slice(0, 60)}`);
    }
  }

  // Create tasks
  for (const desc of taskDirectives) {
    try {
      const newTask = tasks.create({
        description: desc,
        goal_id: goal.id,
        origin: 'goal-eval',
        priority: 'medium',
      });
      goals.addTask(goal.id, newTask.id);
      console.log(`[GoalPursuit] Task created: ${newTask.id} - ${desc.slice(0, 60)}`);
    } catch (e) {
      console.error(`[GoalPursuit] Failed to create task: ${e.message}`);
    }
  }

  // Journal
  recordEvaluation({
    type,
    goalId: goal.id,
    goalDescription: goal.description,
    narrative,
    tasksCreated: taskDirectives.length,
    ...extra,
  });
}

// --- Goal health for reflection context (no API call) ---

export function getGoalHealth() {
  const deadlineGoals = goals.withDeadlines();
  return deadlineGoals.map(g => {
    const taskSummary = getGoalTaskSummary(g);
    const urgency = computeUrgency(g);
    const days = daysRemaining(g);
    const lastEval = g.evaluations?.[g.evaluations.length - 1];

    let lastEvalAgo = 'never';
    if (lastEval) {
      const hoursAgo = Math.round((Date.now() - new Date(lastEval.timestamp).getTime()) / (60 * 60 * 1000));
      lastEvalAgo = hoursAgo < 24 ? `${hoursAgo} hours ago` : `${Math.round(hoursAgo / 24)} days ago`;
    }

    return {
      id: g.id,
      description: g.description,
      progress: g.progress?.target
        ? `${g.progress.current}/${g.progress.target} ${g.progress.unit || ''}`
        : 'no numeric target',
      urgency,
      urgencyLabel: getUrgencyLabel(urgency),
      daysRemaining: days,
      strategy: g.strategy || 'none set',
      lastEval: lastEvalAgo,
      tasksSummary: taskSummary.summary,
    };
  });
}

export function getMaxGoalUrgency() {
  const deadlineGoals = goals.withDeadlines();
  if (deadlineGoals.length === 0) return 0;
  return Math.max(...deadlineGoals.map(g => computeUrgency(g)));
}

// --- Hook: when a goal-linked task completes/fails ---

export function onGoalTaskCompleted(task) {
  if (!task.goal_id) return;

  const goal = goals.get(task.goal_id);
  if (!goal || goal.status !== 'active') return;

  // Update goal timestamp to keep it "fresh" for stale detection
  goals.update(goal.id, {});

  // Count task statuses
  const goalTasks = (goal.tasks || []).map(id => tasks.get(id)).filter(Boolean);
  const allDone = goalTasks.length > 0 && goalTasks.every(t => t.status === 'completed' || t.status === 'failed');

  if (allDone) {
    // All decomposed tasks are done — but that doesn't mean the goal is achieved.
    // A goal like "make $6000" may have all tasks done but target not met.
    // Only mark complete if progress target is met; otherwise force an evaluation
    // to generate new tasks.
    if (goal.progress?.target && goal.progress.current >= goal.progress.target) {
      goals.complete(goal.id, 'All tasks completed and progress target met.');
      console.log(`[GoalPursuit] Goal completed (target met): ${goal.description?.slice(0, 60)}`);
    } else {
      console.log(`[GoalPursuit] All tasks done but goal not yet met — triggering evaluation: ${goal.description?.slice(0, 60)}`);
      // Async eval — fire and forget, will run on next tick or be caught by checkGoalEvaluations
      evaluateGoal(goal).catch(e =>
        console.error(`[GoalPursuit] Post-completion evaluation error: ${e.message}`)
      );
    }
  }
}

// --- Manual progress update ---

export function updateProgress(goalId, value, note) {
  const goal = goals.get(goalId);
  if (!goal) throw new Error(`Goal not found: ${goalId}`);

  const progress = goal.progress || { current: 0, target: null, unit: '', history: [] };
  progress.current = value;
  progress.history = [...(progress.history || []), {
    timestamp: new Date().toISOString(),
    value,
    source: 'manual',
    note,
  }];

  goals.update(goalId, { progress });
  console.log(`[GoalPursuit] Progress updated: ${goal.description?.slice(0, 40)} → ${value}`);
  nudge('goal progress updated');
  return goals.get(goalId);
}

export default {
  checkGoalEvaluations,
  evaluateGoal,
  retrospective,
  computeUrgency,
  getUrgencyLabel,
  getGoalHealth,
  getMaxGoalUrgency,
  updateProgress,
  onGoalTaskCompleted,
};
