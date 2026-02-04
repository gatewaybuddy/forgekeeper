// Heuristics for detecting incomplete assistant outputs and reasons

export function isProbablyIncomplete(text) {
  try {
    if (!text) return true;
    const t = String(text).trim();
    // Balanced triple backticks fence
    const ticks = (t.match(/```/g) || []).length;
    if (ticks % 2 === 1) return true;
    // Terminal punctuation (ASCII + common multilingual)
    const terminalSet = new Set([
      '.', '!', '?', '…',
      '"', '\'', '”', '’', '›', '»', '}', ']', ')', '`',
      '。', '！', '？'
    ]);
    const last = t.slice(-1);
    if (terminalSet.has(last)) return false;
    // No terminal punctuation -> likely incomplete regardless of length
    return true;
  } catch {
    return false;
  }
}

export function incompleteReason(text) {
  try {
    if (!text) return 'short';
    const t = String(text).trim();
    const ticks = (t.match(/```/g) || []).length;
    if (ticks % 2 === 1) return 'fence';
    const terminalSet = new Set(['.', '!', '?', '…', '"', '\'', '”', '’', '›', '»', '}', ']', ')', '`', '。', '！', '？']);
    const last = t.slice(-1);
    if (terminalSet.has(last)) return null;
    if (t.length < 32) return 'short';
    return 'punct';
  } catch {
    return 'unknown';
  }
}
