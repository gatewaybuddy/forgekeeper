// Heuristics for detecting incomplete assistant outputs and reasons

export function isProbablyIncomplete(text) {
  try {
    if (!text) return true;
    const t = String(text).trim();
    if (t.length < 32) return true;
    // Balanced triple backticks fence
    const ticks = (t.match(/```/g) || []).length;
    if (ticks % 2 === 1) return true;
    // Terminal punctuation (ASCII + common multilingual)
    const terminals = 
      ".!?" +
      "\"'”’›»】］）】】》」』】】】】】】】】】】】】】】】】】】】】】】】】"; // filler will be ignored below
    // Build a more complete set explicitly to avoid odd unicode mishaps
    const terminalSet = new Set([
      '.', '!', '?', '…',
      '"', '\'', '”', '’', '›', '»', '】', '］', '）', '】', '》', '」', '』', '】', '}', ']', ')', '`',
      '。', '！', '？', '』', '」', '》', '）', '】', '》', '、'
    ]);
    const last = t.slice(-1);
    if (!terminalSet.has(last)) return true;
    return false;
  } catch {
    return false;
  }
}

export function incompleteReason(text) {
  try {
    if (!text) return 'short';
    const t = String(text).trim();
    if (t.length < 32) return 'short';
    const ticks = (t.match(/```/g) || []).length;
    if (ticks % 2 === 1) return 'fence';
    const terminalSet = new Set(['.', '!', '?', '…', '"', '\'', '”', '’', '›', '»', '】', '］', '）', '》', '」', '』', '}', ']', ')', '`', '。', '！', '？']);
    const last = t.slice(-1);
    if (!terminalSet.has(last)) return 'punct';
    return null;
  } catch {
    return 'unknown';
  }
}

