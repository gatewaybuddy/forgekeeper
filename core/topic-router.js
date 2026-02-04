// Topic Router - Detects and routes multiple topics from a single message
import { query } from './claude.js';
import { tasks, conversations } from './memory.js';
import { randomUUID } from 'crypto';

/**
 * Topic types
 */
export const TOPIC_TYPES = {
  TASK: 'task',           // Something to do (imperative)
  QUESTION: 'question',   // Something to answer
  INFO: 'info',           // Information provided (context)
  FOLLOWUP: 'followup',   // Continuation of previous topic
};

/**
 * Analyze a message and extract distinct topics
 */
export async function analyzeTopics(message, userId) {
  // Quick check - if message is short and simple, skip analysis
  const wordCount = message.split(/\s+/).length;
  if (wordCount < 10 && !message.includes('?') && !message.includes('.')) {
    return [{
      id: randomUUID(),
      content: message,
      type: detectSimpleType(message),
      priority: 'medium',
    }];
  }

  // Use Claude to analyze complex messages
  const analysisPrompt = `Analyze this message and identify distinct topics/requests.

MESSAGE: "${message}"

Rules:
1. Each topic should be a separate, independent item
2. Types: "task" (do something), "question" (answer something), "info" (context/FYI)
3. Keep original wording where possible
4. Don't split tightly coupled items

Return ONLY valid JSON:
{
  "topics": [
    {
      "id": "unique-id",
      "content": "the specific request or question",
      "type": "task|question|info",
      "priority": "high|medium|low",
      "context": "any relevant context from the message"
    }
  ],
  "summary": "one-line summary of what user wants"
}`;

  try {
    const result = await query(analysisPrompt);

    if (!result.success) {
      console.error('[TopicRouter] Analysis failed:', result.error);
      return fallbackParse(message);
    }

    // Extract JSON from response
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackParse(message);
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Validate and normalize topics
    const topics = (analysis.topics || []).map(t => ({
      id: t.id || randomUUID(),
      content: t.content || message,
      type: TOPIC_TYPES[t.type?.toUpperCase()] || TOPIC_TYPES.INFO,
      priority: t.priority || 'medium',
      context: t.context || '',
    }));

    console.log(`[TopicRouter] Detected ${topics.length} topics:`, topics.map(t => t.type));
    return topics;

  } catch (error) {
    console.error('[TopicRouter] Parse error:', error.message);
    return fallbackParse(message);
  }
}

/**
 * Fallback parsing when LLM analysis fails
 */
function fallbackParse(message) {
  const topics = [];

  // Split by sentence-ending punctuation
  const sentences = message.split(/(?<=[.!?])\s+/).filter(s => s.trim());

  for (const sentence of sentences) {
    topics.push({
      id: randomUUID(),
      content: sentence.trim(),
      type: detectSimpleType(sentence),
      priority: 'medium',
      context: '',
    });
  }

  return topics.length > 0 ? topics : [{
    id: randomUUID(),
    content: message,
    type: TOPIC_TYPES.INFO,
    priority: 'medium',
    context: '',
  }];
}

/**
 * Detect topic type from simple patterns
 */
function detectSimpleType(text) {
  const lower = text.toLowerCase();

  // Questions
  if (text.includes('?') ||
      lower.startsWith('what') ||
      lower.startsWith('how') ||
      lower.startsWith('why') ||
      lower.startsWith('when') ||
      lower.startsWith('where') ||
      lower.startsWith('can you') ||
      lower.startsWith('could you') ||
      lower.startsWith('is there')) {
    return TOPIC_TYPES.QUESTION;
  }

  // Tasks (imperative)
  const taskPatterns = /^(create|make|build|add|fix|update|deploy|run|test|install|write|implement|refactor|delete|remove|change|set|configure|check|review|help me)/i;
  if (taskPatterns.test(lower)) {
    return TOPIC_TYPES.TASK;
  }

  return TOPIC_TYPES.INFO;
}

/**
 * Route topics to appropriate handlers
 */
export async function routeTopics(topics, userId, options = {}) {
  const results = [];
  const { agentPool, chat } = options;

  for (const topic of topics) {
    const result = {
      topicId: topic.id,
      type: topic.type,
      content: topic.content,
      handled: false,
      response: null,
      taskId: null,
    };

    try {
      switch (topic.type) {
        case TOPIC_TYPES.TASK:
          // Create a task for execution
          const task = tasks.create({
            description: topic.content,
            priority: topic.priority,
            origin: 'topic-router',
            metadata: { userId, topicId: topic.id, context: topic.context },
          });
          result.taskId = task.id;
          result.response = `Task created: ${task.id}`;
          result.handled = true;

          // If agent pool available, submit immediately
          if (agentPool) {
            await agentPool.submitTask(task);
          }
          break;

        case TOPIC_TYPES.QUESTION:
          // Answer immediately if chat function provided
          if (chat) {
            const answer = await chat(topic.content, userId);
            result.response = answer.reply || answer.output;
            result.handled = true;
          } else {
            // Create as a low-priority task
            const questionTask = tasks.create({
              description: `Answer: ${topic.content}`,
              priority: 'low',
              origin: 'topic-router',
              metadata: { userId, topicId: topic.id, type: 'question' },
            });
            result.taskId = questionTask.id;
            result.response = `I'll answer that shortly (${questionTask.id})`;
            result.handled = true;
          }
          break;

        case TOPIC_TYPES.INFO:
          // Store as context for future use
          conversations.append(userId, {
            role: 'user',
            content: topic.content,
            type: 'context',
            topicId: topic.id,
          });
          result.response = 'Noted.';
          result.handled = true;
          break;

        case TOPIC_TYPES.FOLLOWUP:
          // Handle as continuation of previous topic
          if (chat) {
            const followupAnswer = await chat(topic.content, userId);
            result.response = followupAnswer.reply || followupAnswer.output;
            result.handled = true;
          }
          break;
      }
    } catch (error) {
      console.error(`[TopicRouter] Error handling topic ${topic.id}:`, error.message);
      result.error = error.message;
    }

    results.push(result);
  }

  return results;
}

/**
 * Create a combined response from routed topics
 */
export function combineResponses(results) {
  const parts = [];

  for (const result of results) {
    if (result.error) {
      parts.push(`\u26a0\ufe0f ${result.content.slice(0, 30)}... - Error: ${result.error}`);
    } else if (result.taskId) {
      parts.push(`\u2705 Task: ${result.taskId} - ${result.content.slice(0, 50)}...`);
    } else if (result.response) {
      // For questions, include the full response
      if (result.type === TOPIC_TYPES.QUESTION) {
        parts.push(result.response);
      } else {
        parts.push(result.response);
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Full routing pipeline
 */
export async function routeMessage(message, userId, options = {}) {
  // Analyze topics
  const topics = await analyzeTopics(message, userId);

  // Route each topic
  const results = await routeTopics(topics, userId, options);

  // Combine responses
  const response = combineResponses(results);

  return {
    topics,
    results,
    response,
    taskCount: results.filter(r => r.taskId).length,
    questionCount: results.filter(r => r.type === TOPIC_TYPES.QUESTION).length,
  };
}

export default {
  analyzeTopics,
  routeTopics,
  combineResponses,
  routeMessage,
  TOPIC_TYPES,
};
