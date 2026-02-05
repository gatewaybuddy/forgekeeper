// Chat Planner - Analyzes incoming chat messages and decomposes complex requests
// This runs BEFORE sending to Claude to break down overwhelming requests into manageable pieces
import { query } from './claude.js';

// Quick complexity check - runs fast to decide if we need full analysis
export function isLikelyComplex(message) {
  const lowerMsg = message.toLowerCase();

  // Length-based heuristic
  if (message.length > 500) return true;

  // Keywords that suggest exploration/multi-step work
  const complexKeywords = [
    'explore', 'look at', 'check out', 'examine', 'analyze',
    'all of', 'everything', 'each', 'every',
    'and also', 'and then', 'as well as',
    'make plans', 'create a plan', 'figure out',
    'improve', 'update', 'self', 'autonomous',
    'projects', 'repositories', 'codebase'
  ];

  const keywordCount = complexKeywords.filter(kw => lowerMsg.includes(kw)).length;
  if (keywordCount >= 2) return true;

  // Multiple sentences with action verbs
  const sentences = message.split(/[.!?]/).filter(s => s.trim().length > 10);
  if (sentences.length >= 3) return true;

  return false;
}

// Full analysis - uses a quick Claude call to decompose the request
export async function analyzeAndDecompose(message, options = {}) {
  console.log('[ChatPlanner] Analyzing complex message...');

  const prompt = `You are a task decomposition agent. Your job is to break down complex user requests into simple, executable subtasks.

USER REQUEST:
"${message}"

RULES:
1. If this is a SIMPLE request (single clear action, can be done in <2 minutes), respond with: {"simple": true}
2. If COMPLEX, break it into 2-5 INDEPENDENT subtasks that can potentially run in parallel
3. Each subtask must be:
   - Specific and actionable
   - Completable in under 3 minutes
   - Self-contained (doesn't depend on other subtasks completing first)
4. For exploration tasks, break by AREA not by sequence
5. Keep the user's original intent - don't add things they didn't ask for

RESPOND WITH ONLY VALID JSON:
{
  "simple": false,
  "reasoning": "Brief explanation of decomposition",
  "subtasks": [
    {"description": "First specific subtask", "type": "explore|execute|research"},
    {"description": "Second specific subtask", "type": "explore|execute|research"}
  ],
  "aggregation": "How to combine results into final response"
}

OR for simple requests:
{"simple": true}`;

  try {
    const result = await query(prompt, { timeout: 30000 }); // Quick 30s timeout for analysis

    if (!result.success) {
      console.error('[ChatPlanner] Analysis failed:', result.error);
      return { simple: true }; // Default to simple if analysis fails
    }

    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[ChatPlanner] No JSON in response');
      return { simple: true };
    }

    const analysis = JSON.parse(jsonMatch[0]);

    if (analysis.simple) {
      console.log('[ChatPlanner] Message is simple, no decomposition needed');
      return { simple: true };
    }

    console.log(`[ChatPlanner] Decomposed into ${analysis.subtasks?.length || 0} subtasks`);
    return analysis;

  } catch (error) {
    console.error('[ChatPlanner] Error:', error.message);
    return { simple: true };
  }
}

// Execute subtasks and aggregate results
export async function executeSubtasks(subtasks, chatFn, userId) {
  console.log(`[ChatPlanner] Executing ${subtasks.length} subtasks...`);

  const results = [];

  // Execute subtasks - could be parallelized in future
  for (const subtask of subtasks) {
    console.log(`[ChatPlanner] Running: ${subtask.description.slice(0, 50)}...`);

    try {
      const result = await chatFn(subtask.description, userId);
      results.push({
        description: subtask.description,
        type: subtask.type,
        success: !!result.reply,
        output: result.reply || result.error || 'No response'
      });
    } catch (error) {
      results.push({
        description: subtask.description,
        type: subtask.type,
        success: false,
        output: `Error: ${error.message}`
      });
    }
  }

  return results;
}

// Format aggregated results for user
export function formatResults(results, aggregation) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  let response = '';

  if (aggregation) {
    response += `${aggregation}\n\n`;
  }

  for (const result of successful) {
    response += `## ${result.description}\n${result.output}\n\n`;
  }

  if (failed.length > 0) {
    response += `---\n⚠️ Some subtasks had issues:\n`;
    for (const result of failed) {
      response += `- ${result.description}: ${result.output}\n`;
    }
  }

  return response.trim();
}

// Main entry point - process a chat message through the planner
export async function processChat(message, chatFn, userId) {
  // Quick check first
  if (!isLikelyComplex(message)) {
    return null; // Let normal chat flow handle it
  }

  // Full analysis
  const analysis = await analyzeAndDecompose(message);

  if (analysis.simple) {
    return null; // Let normal chat flow handle it
  }

  // Execute subtasks
  const results = await executeSubtasks(analysis.subtasks, chatFn, userId);

  // Format and return aggregated response
  return formatResults(results, analysis.aggregation);
}

export default { isLikelyComplex, analyzeAndDecompose, executeSubtasks, formatResults, processChat };
