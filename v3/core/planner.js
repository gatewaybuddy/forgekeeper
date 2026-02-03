// Planner agent - analyzes tasks and decomposes into executable chunks
// This agent NEVER implements - it only plans and breaks down work
import { query } from './claude.js';
import { tasks } from './memory.js';

// Analyze a task and decide how to handle it
export async function analyzeTask(task) {
  // Skip if already analyzed or is a subtask
  if (task.analyzed || task.parent_task_id) {
    return { action: 'execute', reason: 'Already analyzed or is a subtask' };
  }

  console.log(`[Planner] Analyzing task: ${task.id}`);

  const prompt = `You are a project manager agent. Analyze this task and decide how to handle it.

Task: "${task.description}"

Evaluate:
1. Can this be completed in a SINGLE focused action (< 3 minutes of work)?
2. Is it specific enough to act on immediately?
3. Does it require multiple distinct steps?

Respond with ONLY valid JSON in this exact format:
{
  "action": "execute" | "decompose",
  "reason": "brief explanation",
  "subtasks": []  // only if action is "decompose"
}

If action is "decompose", provide 2-5 subtasks, each being:
- A SINGLE specific action (not "implement X system")
- Completable in under 3 minutes
- Clear enough that no further clarification is needed

Example subtask descriptions:
- GOOD: "Create file src/utils/logger.js with a simple console wrapper"
- GOOD: "Add PM2 to package.json devDependencies"
- BAD: "Implement logging system" (too vague)
- BAD: "Set up the infrastructure" (too broad)

If the task is already simple and specific, use action: "execute".`;

  try {
    const result = await query(prompt);

    if (!result.success) {
      console.error(`[Planner] Query failed: ${result.error}`);
      // Default to execute if analysis fails
      return { action: 'execute', reason: 'Analysis failed, attempting direct execution' };
    }

    // Extract JSON from response
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Planner] No JSON in response');
      return { action: 'execute', reason: 'Could not parse analysis' };
    }

    const analysis = JSON.parse(jsonMatch[0]);
    console.log(`[Planner] Decision: ${analysis.action} - ${analysis.reason}`);

    return analysis;

  } catch (error) {
    console.error(`[Planner] Error: ${error.message}`);
    return { action: 'execute', reason: 'Analysis error, attempting direct execution' };
  }
}

// Process a task through the planner
export async function planTask(task) {
  const analysis = await analyzeTask(task);

  if (analysis.action === 'execute') {
    // Mark as analyzed and ready for execution
    tasks.update(task.id, { analyzed: true, plan_notes: analysis.reason });
    return { ready: true, task };
  }

  if (analysis.action === 'decompose' && analysis.subtasks?.length > 0) {
    console.log(`[Planner] Decomposing into ${analysis.subtasks.length} subtasks`);

    const createdSubtasks = [];
    for (const st of analysis.subtasks) {
      const desc = typeof st === 'string' ? st : st.description;
      const subtask = tasks.create({
        description: desc,
        priority: st.priority || task.priority || 'medium',
        parent_task_id: task.id,
        origin: 'planner',
        analyzed: true, // Subtasks are pre-analyzed (they're already specific)
        tags: task.tags || [],
      });
      createdSubtasks.push(subtask);
      console.log(`[Planner] Created subtask: ${subtask.id} - ${desc.slice(0, 50)}...`);
    }

    // Mark original task as decomposed
    tasks.update(task.id, {
      status: 'decomposed',
      subtasks: createdSubtasks.map(t => t.id),
      plan_notes: analysis.reason
    });

    return { ready: false, decomposed: true, subtasks: createdSubtasks };
  }

  // Fallback: just execute
  tasks.update(task.id, { analyzed: true });
  return { ready: true, task };
}

// Check if all subtasks of a parent are complete
export function checkParentCompletion(task) {
  if (!task.parent_task_id) return;

  const parent = tasks.get(task.parent_task_id);
  if (!parent || parent.status !== 'decomposed') return;

  const subtaskIds = parent.subtasks || [];
  const subtaskStatuses = subtaskIds.map(id => tasks.get(id)?.status);

  const allComplete = subtaskStatuses.every(s => s === 'completed');
  const anyFailed = subtaskStatuses.some(s => s === 'failed');

  if (allComplete) {
    console.log(`[Planner] All subtasks complete, marking parent ${parent.id} as completed`);
    tasks.update(parent.id, { status: 'completed' });
  } else if (anyFailed) {
    const failedCount = subtaskStatuses.filter(s => s === 'failed').length;
    console.log(`[Planner] ${failedCount} subtasks failed for parent ${parent.id}`);
    // Don't mark parent as failed yet - some subtasks might still be pending
  }
}

export default { analyzeTask, planTask, checkParentCompletion };
