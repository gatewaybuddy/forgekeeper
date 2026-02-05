// Quick test for intent translator
import { translateIntent } from '../core/intent-translator.js';

const testThoughts = [
  // Should create task
  "I should check if the tests are still passing after the recent changes.",
  "I need to look into why the proactive messages are duplicating.",
  "Let me review the error handling in the chat function.",

  // Should NOT create task (vague/not actionable)
  "I wonder what Rado is working on today.",
  "The codebase feels clean and well-organized.",
  "It's been a quiet evening.",
];

async function runTests() {
  console.log('Testing Intent Translator\n');
  console.log('='.repeat(50));

  for (const thought of testThoughts) {
    console.log(`\nThought: "${thought.slice(0, 60)}..."`);
    console.log('-'.repeat(50));

    const result = await translateIntent(thought, {
      activeGoals: [],
      pendingTasks: [],
      recentThoughts: [],
    });

    console.log(`Should create task: ${result.shouldCreateTask}`);
    console.log(`Reasoning: ${result.reasoning}`);
    if (result.task) {
      console.log(`Task: ${result.task.description}`);
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n' + '='.repeat(50));
  console.log('Tests complete');
}

runTests().catch(console.error);
