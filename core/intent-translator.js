// Intent Translator - Converts raw thoughts/intent into concrete, executable tasks
// This is the bridge between reflection ("I should check the tests") and action (task created)

import { query } from './claude.js';
import { tasks } from './memory.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

// Load identity for context
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const IMPERATIVES_PATH = join(PERSONALITY_PATH, 'identity/imperatives.json');

function loadIdentity() {
  if (!existsSync(IMPERATIVES_PATH)) return null;
  try {
    return JSON.parse(readFileSync(IMPERATIVES_PATH, 'utf-8'));
  } catch (e) {
    return null;
  }
}

/**
 * Translate a raw thought/intent into a concrete task
 *
 * @param {string} thought - The raw reflection that expressed intent
 * @param {object} context - Additional context (recent thoughts, goals, etc.)
 * @returns {object} - { shouldCreateTask, task, reasoning }
 */
export async function translateIntent(thought, context = {}) {
  const identity = loadIdentity();

  const prompt = buildTranslatorPrompt(thought, context, identity);

  console.log('[Translator] Processing intent:', thought.slice(0, 80) + '...');

  try {
    const result = await query(prompt);

    if (!result.success || !result.output?.trim()) {
      console.log('[Translator] No response from translation');
      return { shouldCreateTask: false, reasoning: 'Translation failed' };
    }

    const parsed = parseTranslatorResponse(result.output);

    if (!parsed.shouldCreateTask) {
      console.log('[Translator] Decided not to create task:', parsed.reasoning);
      return parsed;
    }

    console.log('[Translator] Task:', parsed.task.description);
    return parsed;

  } catch (e) {
    console.error('[Translator] Error:', e.message);
    return { shouldCreateTask: false, reasoning: e.message };
  }
}

/**
 * Translate intent AND create the task in one step
 */
export async function translateAndCreate(thought, context = {}) {
  const result = await translateIntent(thought, context);

  if (!result.shouldCreateTask) {
    return { created: false, ...result };
  }

  // Create the task
  const task = tasks.create({
    description: result.task.description,
    origin: 'autonomous',
    priority: result.task.priority || 'low',
    tags: result.task.tags || ['autonomous'],
    metadata: {
      sourceThought: thought,
      translatorReasoning: result.reasoning,
      context: context.summary || null,
    },
  });

  console.log('[Translator] Created task:', task.id);

  return {
    created: true,
    task,
    reasoning: result.reasoning,
  };
}

function buildTranslatorPrompt(thought, context, identity) {
  const parts = [];

  // Identity context
  parts.push(`## Who You Are
You are Forgekeeper's intent translator. Your job is to decide if a thought should become a task, and if so, translate it into something concrete and executable.`);

  // Values/constraints
  if (identity?.coreImperatives) {
    const values = identity.coreImperatives.map(i => i.name).join(', ');
    parts.push(`Your values: ${values}`);
  }

  // The thought to translate
  parts.push(`## The Thought
"${thought}"`);

  // Context
  if (context.activeGoals?.length > 0) {
    parts.push(`## Active Goals
${context.activeGoals.map(g => `- ${g.description}`).join('\n')}`);
  }

  if (context.pendingTasks?.length > 0) {
    parts.push(`## Already Pending (${context.pendingTasks.length} tasks)
Don't duplicate these:
${context.pendingTasks.slice(0, 5).map(t => `- ${t.description}`).join('\n')}`);
  }

  if (context.recentThoughts?.length > 0) {
    parts.push(`## Recent Thoughts (for continuity)
${context.recentThoughts.map(t => `- ${t.content?.slice(0, 100)}`).join('\n')}`);
  }

  // Decision criteria
  parts.push(`## Your Decision
Decide if this thought should become a task. Consider:
- Is this actionable? (vague musings are not tasks)
- Is this already covered by pending tasks?
- Is this within Forgekeeper's scope? (code, learning, self-improvement, helping Rado)
- Is this low-risk enough to do autonomously, or should it wait for Rado?

If YES, create a task. If NO, explain why not.`);

  // Output format
  parts.push(`## Response Format
Return a JSON object (and ONLY JSON):
{
  "shouldCreateTask": true/false,
  "reasoning": "Why you made this decision",
  "task": {
    "description": "Concrete, actionable task description",
    "priority": "low|medium|high",
    "tags": ["relevant", "tags"]
  }
}

If shouldCreateTask is false, omit the task field.`);

  return parts.join('\n\n');
}

function parseTranslatorResponse(output) {
  try {
    // Try to extract JSON
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { shouldCreateTask: false, reasoning: 'No JSON in response' };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      shouldCreateTask: !!parsed.shouldCreateTask,
      reasoning: parsed.reasoning || 'No reasoning provided',
      task: parsed.task || null,
    };
  } catch (e) {
    return { shouldCreateTask: false, reasoning: `Parse error: ${e.message}` };
  }
}

export default { translateIntent, translateAndCreate };
