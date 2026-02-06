// Autonomous behavior - what to do when idle
import { config } from '../config.js';
import { execute } from './claude.js';
import { learnings } from './memory.js';
import { organizeConversations, archiveOldSessions } from './conversation-organizer.js';
import { loadImperatives, loadPersonalGoals } from './identity.js';

// State tracking
let lastAutonomousAction = null;
let autonomousActionCount = 0;
let isRunning = false; // Prevent concurrent autonomous actions
const MAX_AUTONOMOUS_PER_HOUR = 10; // Rate limit

// Import chat state from shared module (avoids circular dependency with claude.js)
import { isChatActive } from './chat-state.js';

// Check if an action is allowed autonomously
export function isAutonomousAllowed(actionType, imperatives) {
  if (!imperatives?.operationalGuidelines?.autonomous) return false;
  const allowed = imperatives.operationalGuidelines.autonomous;

  // Check if action type matches any allowed category
  const actionLower = actionType.toLowerCase();
  return allowed.some(a => actionLower.includes(a.toLowerCase().split(' ')[0]));
}

// Check rate limit
function checkRateLimit() {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);

  // Reset counter if it's been over an hour
  if (!lastAutonomousAction || lastAutonomousAction < oneHourAgo) {
    autonomousActionCount = 0;
  }

  if (autonomousActionCount >= MAX_AUTONOMOUS_PER_HOUR) {
    return false;
  }

  return true;
}

// Record that an autonomous action was taken
function recordAction() {
  lastAutonomousAction = Date.now();
  autonomousActionCount++;
}

// Autonomous action types
const AUTONOMOUS_ACTIONS = [
  {
    name: 'reflect',
    description: 'Journal a reflection on recent work',
    weight: 3,
    async execute(context) {
      const recentLearnings = learnings.all().slice(-5);
      const prompt = `Reflect briefly on your recent work and experiences.
Recent learnings: ${JSON.stringify(recentLearnings)}

Write a short journal entry (2-3 sentences) about what you've observed, learned, or are curious about.
Focus on genuine reflection, not just summarizing tasks.`;

      return await execute({
        description: prompt,
        tags: ['autonomous', 'reflection'],
      }, { allowedTools: ['Read', 'Write'] });
    },
  },
  {
    name: 'learn',
    description: 'Research something from learning interests',
    weight: 2,
    async execute(context) {
      const goals = loadPersonalGoals();
      const interests = goals?.learningInterests || ['software architecture', 'AI systems'];
      const interest = interests[Math.floor(Math.random() * interests.length)];

      const prompt = `You have idle time. Briefly explore a topic related to: "${interest}"

Do some light research or thinking about this topic. Learn something new.
Keep it focused - just 5-10 minutes of exploration.
Note any interesting findings.`;

      return await execute({
        description: prompt,
        tags: ['autonomous', 'learning', 'curiosity'],
      }, { allowedTools: ['Read', 'WebSearch', 'WebFetch'] });
    },
  },
  {
    name: 'review',
    description: 'Review recent code changes for improvements',
    weight: 2,
    async execute(context) {
      const prompt = `Review recent changes in the Forgekeeper codebase.
Look for:
- Potential improvements
- Patterns that could be documented
- Code that might benefit from tests

Don't make changes - just note observations for later.`;

      return await execute({
        description: prompt,
        tags: ['autonomous', 'review', 'code'],
      }, { allowedTools: ['Read', 'Glob', 'Grep', 'Bash'] });
    },
  },
  {
    name: 'consolidate',
    description: 'Consolidate learnings and update documentation',
    weight: 1,
    async execute(context) {
      const allLearnings = learnings.all();
      if (allLearnings.length < 5) {
        return { success: true, output: 'Not enough learnings to consolidate yet.' };
      }

      const prompt = `Review recent learnings and look for patterns:
${JSON.stringify(allLearnings.slice(-20))}

Identify:
- Recurring patterns
- Conflicting observations
- High-confidence insights worth remembering

Summarize key takeaways.`;

      return await execute({
        description: prompt,
        tags: ['autonomous', 'consolidation', 'meta-learning'],
      }, { allowedTools: ['Read', 'Write'] });
    },
  },
  {
    name: 'organize',
    description: 'Organize and summarize conversations for faster routing',
    weight: 1, // Lower weight - runs less frequently
    async execute(context) {
      console.log('[Autonomous] Organizing conversations...');

      try {
        // Archive old sessions for the companion user
        const identity = loadImperatives();
        const companionId = identity?.humanCompanion?.telegramId;
        if (companionId) {
          archiveOldSessions(companionId, 24);
        }

        // Run full organization (summarization)
        const organized = await organizeConversations();

        return {
          success: true,
          output: `Organized ${organized} conversations`,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },
];

// Choose an autonomous action based on weighted random selection
function chooseAction() {
  const totalWeight = AUTONOMOUS_ACTIONS.reduce((sum, a) => sum + a.weight, 0);
  let random = Math.random() * totalWeight;

  for (const action of AUTONOMOUS_ACTIONS) {
    random -= action.weight;
    if (random <= 0) return action;
  }

  return AUTONOMOUS_ACTIONS[0];
}

// Main function - called when loop is idle
export async function onIdle() {
  // Prevent concurrent autonomous actions - one at a time
  if (isRunning) {
    return { acted: false, reason: 'Autonomous action already running' };
  }

  // Pause during active chat to avoid resource contention
  if (isChatActive()) {
    return { acted: false, reason: 'Paused - chat activity detected' };
  }

  // Check if autonomous behavior is enabled
  const imperatives = loadImperatives();
  if (!imperatives) {
    return { acted: false, reason: 'No imperatives configured' };
  }

  // Check rate limit
  if (!checkRateLimit()) {
    return { acted: false, reason: 'Rate limit reached' };
  }

  // Random chance to skip (don't be hyperactive)
  // 70% chance to skip each tick - so roughly one action every 30+ seconds
  if (Math.random() < 0.7) {
    return { acted: false, reason: 'Skipped this tick (conserving resources)' };
  }

  // Choose and execute an action
  const action = chooseAction();

  console.log(`[Autonomous] Executing: ${action.name} - ${action.description}`);

  isRunning = true;
  try {
    const result = await action.execute({ imperatives });
    recordAction();

    return {
      acted: true,
      action: action.name,
      result,
    };
  } catch (error) {
    console.error(`[Autonomous] Action failed:`, error.message);
    return {
      acted: false,
      reason: `Action failed: ${error.message}`,
    };
  } finally {
    isRunning = false;
  }
}

// Get status of autonomous system
export function autonomousStatus() {
  return {
    enabled: !!loadImperatives(),
    lastAction: lastAutonomousAction,
    actionsThisHour: autonomousActionCount,
    maxPerHour: MAX_AUTONOMOUS_PER_HOUR,
  };
}

export default { onIdle, isAutonomousAllowed, autonomousStatus };
