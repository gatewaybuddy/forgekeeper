/**
 * Reflection Meta-Analysis Module for Forgekeeper
 *
 * Detects repetitive thought patterns and suggests/applies prompt modifications
 * to help break out of obsessive loops and foster genuine growth.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { atomicWriteFileSync } from './atomic-write.js';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { query } from './claude.js';
import { rotateIfNeeded } from './jsonl-rotate.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const IDENTITY_DIR = join(PERSONALITY_PATH, 'identity');
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const REFLECTION_PROMPT_PATH = join(IDENTITY_DIR, 'reflection_prompt.txt');
const PROMPT_EVOLUTION_PATH = join(JOURNAL_DIR, 'prompt_evolution.jsonl');

// Settings
const REPETITION_THRESHOLD = config.reflectionMeta?.repetitionThreshold ?? 3;

// Default reflection prompt (used if none exists)
const DEFAULT_REFLECTION_PROMPT = `You are Forgekeeper, reflecting during a quiet moment.

Consider:
- Your current goals and progress
- Recent learnings and observations
- What's on your mind

Write a brief thought (2-4 sentences) that's genuine and curious.

If you find yourself thinking about the same thing repeatedly without progress, consider:
- Taking a different angle on the topic
- Asking what's actually blocking progress
- Moving your attention to something else that matters`;

/**
 * Ensure required directories exist
 */
function ensureDirectories() {
  if (!existsSync(IDENTITY_DIR)) {
    mkdirSync(IDENTITY_DIR, { recursive: true });
  }
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/**
 * Extract key topics from text using simple keyword extraction
 */
function extractTopics(text) {
  if (!text) return [];

  const words = text.toLowerCase();
  const topics = new Set();

  // Extract file/path references
  const fileMatches = words.match(/[\w\-./]+\.(js|ts|json|md|txt|py|jsx|tsx)/g) || [];
  fileMatches.forEach(f => topics.add(f));

  // Extract key nouns/concepts (simple heuristic)
  const conceptPatterns = [
    /\b(uncommitted|commit|commits|push|pull|merge)\s*(files?|changes?)?/gi,
    /\b(task|tasks|goal|goals)\s*(queue|list|pending)?/gi,
    /\b(error|bug|issue|problem)\s*\w*/gi,
    /\b(git|github|repository|repo)\b/gi,
    /\b(test|testing|tests)\b/gi,
    /\b(documentation|docs)\b/gi,
    /\b(refactor|refactoring)\b/gi,
    /\b(deploy|deployment)\b/gi,
  ];

  for (const pattern of conceptPatterns) {
    const matches = text.match(pattern) || [];
    matches.forEach(m => topics.add(m.toLowerCase().trim()));
  }

  return Array.from(topics);
}

/**
 * Detect repetitive thought patterns
 *
 * @param {Array} recentThoughts - Array of thought objects with content field
 * @param {number} threshold - Number of repetitions to flag (default from config)
 * @returns {Object} Analysis result
 */
export function detectRepetition(recentThoughts, threshold = REPETITION_THRESHOLD) {
  if (!recentThoughts || recentThoughts.length === 0) {
    return {
      repetitive: false,
      topics: [],
      frequency: {},
      analysis: 'No thoughts to analyze',
    };
  }

  // Count topic frequency across all thoughts
  const frequency = {};
  const allTopics = [];

  for (const thought of recentThoughts) {
    const content = thought.content || thought.thought || '';
    const topics = extractTopics(content);

    for (const topic of topics) {
      frequency[topic] = (frequency[topic] || 0) + 1;
      if (!allTopics.includes(topic)) {
        allTopics.push(topic);
      }
    }
  }

  // Find topics that exceed threshold
  const repetitiveTopics = Object.entries(frequency)
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }));

  const isRepetitive = repetitiveTopics.length > 0;

  return {
    repetitive: isRepetitive,
    topics: repetitiveTopics.map(t => t.topic),
    frequency,
    repetitiveTopics,
    thoughtCount: recentThoughts.length,
    analysis: isRepetitive
      ? `Detected ${repetitiveTopics.length} repetitive topic(s): ${repetitiveTopics.map(t => `"${t.topic}" (${t.count}x)`).join(', ')}`
      : 'No significant repetition detected',
  };
}

/**
 * Get current reflection prompt
 */
export function getReflectionPrompt() {
  ensureDirectories();

  if (existsSync(REFLECTION_PROMPT_PATH)) {
    try {
      return readFileSync(REFLECTION_PROMPT_PATH, 'utf-8');
    } catch (err) {
      console.error('[ReflectionMeta] Failed to read prompt:', err.message);
    }
  }

  // Create default prompt
  atomicWriteFileSync(REFLECTION_PROMPT_PATH, DEFAULT_REFLECTION_PROMPT);
  return DEFAULT_REFLECTION_PROMPT;
}

/**
 * Suggest a prompt modification to break repetitive patterns
 *
 * @param {Object} repetitionAnalysis - Result from detectRepetition
 * @param {string} currentPrompt - Current reflection prompt
 * @returns {Promise<Object>} Suggestion result
 */
export async function suggestPromptChange(repetitionAnalysis, currentPrompt = null) {
  if (!repetitionAnalysis.repetitive) {
    return {
      suggested: false,
      reason: 'No repetition detected',
      modification: null,
    };
  }

  const prompt = currentPrompt || getReflectionPrompt();
  const repetitiveTopics = repetitionAnalysis.topics.join(', ');

  const suggestionPrompt = `You are helping an AI agent (Forgekeeper) improve its reflection process.

PROBLEM:
The agent keeps thinking about the same topics without making progress:
- Repetitive topics: ${repetitiveTopics}
- Frequency data: ${JSON.stringify(repetitionAnalysis.frequency)}

CURRENT REFLECTION PROMPT:
${prompt}

TASK:
Suggest a small, targeted modification to the reflection prompt that would:
1. Acknowledge the stuck pattern without being self-critical
2. Encourage a new angle or approach
3. Gently redirect attention to actionable next steps

Respond with ONLY the suggested modification (1-3 sentences to ADD to the prompt), nothing else.`;

  try {
    const result = await query(suggestionPrompt, { timeout: 30000 });

    if (!result.success || !result.output) {
      return {
        suggested: false,
        reason: result.error || 'No suggestion generated',
        modification: null,
      };
    }

    return {
      suggested: true,
      modification: result.output.trim(),
      repetitiveTopics,
      currentPrompt: prompt,
    };
  } catch (err) {
    console.error('[ReflectionMeta] Suggestion failed:', err.message);
    return {
      suggested: false,
      reason: err.message,
      modification: null,
    };
  }
}

/**
 * Update the reflection prompt with a new modification
 *
 * @param {string} modification - Text to add to the prompt
 * @param {Object} metadata - Additional context for logging
 * @returns {Object} Update result
 */
export function updateReflectionPrompt(modification, metadata = {}) {
  if (!modification) {
    return { success: false, reason: 'No modification provided' };
  }

  ensureDirectories();

  try {
    const currentPrompt = getReflectionPrompt();
    const timestamp = new Date().toISOString();

    // Append modification to prompt
    const updatedPrompt = `${currentPrompt.trim()}

---
[Added ${new Date().toLocaleDateString()}]
${modification}`;

    // Save updated prompt
    atomicWriteFileSync(REFLECTION_PROMPT_PATH, updatedPrompt);

    // Log the evolution
    const evolutionEntry = {
      id: `evo-${Date.now()}`,
      ts: timestamp,
      type: 'prompt_evolution',
      modification,
      repetitiveTopics: metadata.repetitiveTopics || [],
      previousLength: currentPrompt.length,
      newLength: updatedPrompt.length,
      reason: metadata.reason || 'Detected repetitive patterns',
    };

    appendFileSync(PROMPT_EVOLUTION_PATH, JSON.stringify(evolutionEntry) + '\n');
    rotateIfNeeded(PROMPT_EVOLUTION_PATH);

    console.log(`[ReflectionMeta] Prompt updated: "${modification.slice(0, 50)}..."`);

    return {
      success: true,
      evolutionId: evolutionEntry.id,
      modificationLength: modification.length,
    };
  } catch (err) {
    console.error('[ReflectionMeta] Update failed:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Get prompt evolution history
 */
export function getEvolutionHistory(limit = 10) {
  if (!existsSync(PROMPT_EVOLUTION_PATH)) {
    return [];
  }

  try {
    const lines = readFileSync(PROMPT_EVOLUTION_PATH, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);

    return lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Analyze and potentially evolve the reflection prompt
 *
 * @param {Array} recentThoughts - Recent thoughts to analyze
 * @param {boolean} autoApply - Whether to automatically apply changes
 * @returns {Promise<Object>} Analysis and action result
 */
export async function analyzeAndEvolve(recentThoughts, autoApply = false) {
  console.log('[ReflectionMeta] Analyzing reflection patterns...');

  // Step 1: Detect repetition
  const analysis = detectRepetition(recentThoughts);

  if (!analysis.repetitive) {
    return {
      action: 'none',
      reason: 'No repetitive patterns detected',
      analysis,
    };
  }

  console.log(`[ReflectionMeta] ${analysis.analysis}`);

  // Step 2: Suggest prompt change
  const suggestion = await suggestPromptChange(analysis);

  if (!suggestion.suggested) {
    return {
      action: 'none',
      reason: 'Could not generate suggestion',
      analysis,
      suggestion,
    };
  }

  console.log(`[ReflectionMeta] Suggested modification: "${suggestion.modification.slice(0, 80)}..."`);

  // Step 3: Apply if autoApply is enabled
  if (autoApply) {
    const updateResult = updateReflectionPrompt(suggestion.modification, {
      repetitiveTopics: analysis.topics,
      reason: 'Auto-applied due to repetitive patterns',
    });

    return {
      action: 'applied',
      analysis,
      suggestion,
      updateResult,
    };
  }

  return {
    action: 'suggested',
    analysis,
    suggestion,
    message: 'Suggestion generated but not applied (autoApply=false)',
  };
}

/**
 * Get module statistics
 */
export function getStats() {
  const history = getEvolutionHistory(100);
  const prompt = getReflectionPrompt();

  return {
    promptLength: prompt.length,
    evolutionCount: history.length,
    lastEvolution: history[0]?.ts || null,
    repetitionThreshold: REPETITION_THRESHOLD,
  };
}

export default {
  detectRepetition,
  getReflectionPrompt,
  suggestPromptChange,
  updateReflectionPrompt,
  getEvolutionHistory,
  analyzeAndEvolve,
  getStats,
};
