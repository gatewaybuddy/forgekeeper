/**
 * Token estimation utilities
 * Rough approximation: ~4 characters per token
 */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough approximation: 4 characters per token
  return Math.ceil(text.length / 4);
}

export function estimateTokensFromMessages(
  messages: Array<{ role: string; content: string }>
): number {
  let total = 0;

  for (const message of messages) {
    // Message overhead (role, formatting, etc.)
    total += 4;
    // Content
    total += estimateTokens(message.content);
  }

  return total;
}

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);

  if (currentTokens <= maxTokens) {
    return text;
  }

  // Rough truncation
  const targetChars = maxTokens * 4;
  return text.slice(0, targetChars) + '...';
}
