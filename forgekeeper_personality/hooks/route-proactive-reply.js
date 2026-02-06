/**
 * route-proactive-reply.js - Forgekeeper Hook
 *
 * Triggered by: message:received
 *
 * Detects when a user is replying to a proactive message (like reflection thoughts)
 * and skips complexity detection to prevent simple replies from being routed to tasks.
 *
 * This fixes T415 - Smarter chat complexity detection
 */

// Run early to influence routing decisions
export const priority = 100;

// Patterns that indicate proactive messages
const PROACTIVE_INDICATORS = [
  /^\*[^*]+\*/, // Actions like *stretches*, *looks around*
  /^💭/, // Thought emoji
  /^🤔/, // Thinking emoji
  /^I've been thinking/i,
  /^I noticed/i,
  /^I was reflecting/i,
  /^While idle/i,
];

// Short reply patterns that shouldn't be complex
const SIMPLE_REPLY_PATTERNS = [
  /^(yes|yeah|yep|yup|sure|ok|okay|k|go|do it|please|thanks)[\s!.?]*$/i,
  /^(no|nope|nah|don't|stop|wait|hold on)[\s!.?]*$/i,
  /^(be bold|go for it|sounds good|makes sense|i agree|good idea)[\s!.?]*$/i,
  /^(tell me more|go on|continue|keep going|and\?|so\?)[\s!.?]*$/i,
  /^(lol|haha|nice|cool|great|awesome|perfect|exactly)[\s!.?]*$/i,
];

/**
 * Execute the hook
 */
export async function execute(event, context) {
  const { message, lastAssistantMessage, isProactiveContext } = context;

  if (!message) return null;

  const msgLower = message.toLowerCase().trim();
  const msgLength = message.trim().length;

  // Check if replying to proactive message
  let isReplyToProactive = isProactiveContext || false;

  if (lastAssistantMessage) {
    for (const pattern of PROACTIVE_INDICATORS) {
      if (pattern.test(lastAssistantMessage)) {
        isReplyToProactive = true;
        break;
      }
    }
  }

  // Check if this is a simple reply
  let isSimpleReply = false;
  for (const pattern of SIMPLE_REPLY_PATTERNS) {
    if (pattern.test(msgLower)) {
      isSimpleReply = true;
      break;
    }
  }

  // Very short messages (under 50 chars) are likely simple unless they contain task keywords
  const hasTaskKeywords = /\b(create|make|build|add|fix|update|deploy|run|test|install|write|implement|refactor)\b/i.test(message);
  if (msgLength < 50 && !hasTaskKeywords) {
    isSimpleReply = true;
  }

  // If replying to proactive OR is a simple reply, skip complexity check
  if (isReplyToProactive || isSimpleReply) {
    console.log(`[Hook/route-proactive-reply] Detected ${isReplyToProactive ? 'proactive reply' : 'simple message'}, skipping complexity check`);
    return {
      skipComplexityCheck: true,
      routingReason: isReplyToProactive ? 'proactive-reply' : 'simple-message',
    };
  }

  return null;
}
