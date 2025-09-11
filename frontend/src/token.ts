export function countTokens(text: string): number {
  // Very rough heuristic: split on whitespace and punctuation clusters
  if (!text) return 0;
  const parts = text.trim().split(/\s+|([,.!?;:\-()\[\]{}"'])/g).filter(Boolean);
  return parts.length;
}

