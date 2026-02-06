// Telegram message chunker - splits long messages at natural boundaries
// Telegram has a 4096 character limit per message
//
// Split priority:
// 0. Code block preservation (avoid splitting mid-block unless it exceeds maxLength)
// 1. Paragraph boundaries (double newline)
// 2. Line boundaries (single newline)
// 3. Sentence boundaries (. ! ? followed by space)
// 4. Word boundaries (space)
// 5. Hard split (only as last resort)

const DEFAULT_MAX_LENGTH = 4096;
const MIN_SPLIT_RATIO = 0.3; // Don't split before 30% of max length

/**
 * Split a message into chunks that respect Telegram's character limit.
 * Prioritizes splitting at natural boundaries for readability:
 * paragraphs > lines > sentences > words > hard split
 *
 * @param {string} text - The message text to chunk
 * @param {number} maxLength - Maximum characters per chunk (default: 4096)
 * @returns {string[]} Array of message chunks
 */
export function chunkMessage(text, maxLength = DEFAULT_MAX_LENGTH) {
  if (!text || text.length <= maxLength) {
    return text ? [text] : [];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find the best split point within maxLength
    const splitPoint = findSplitPoint(remaining, maxLength);
    const chunk = remaining.slice(0, splitPoint).trimEnd();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    remaining = remaining.slice(splitPoint).trimStart();
  }

  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Find all code block positions in text.
 * Returns array of {start, end} for each fenced code block.
 *
 * @param {string} text - Text to search
 * @returns {Array<{start: number, end: number}>} Code block positions
 */
function findCodeBlocks(text) {
  const blocks = [];
  const regex = /```[\w]*\n[\s\S]*?```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ start: match.index, end: match.index + match[0].length });
  }
  return blocks;
}

/**
 * Check if a position is inside any code block.
 *
 * @param {number} position - Position to check
 * @param {Array<{start: number, end: number}>} codeBlocks - Code block positions
 * @returns {{inside: boolean, block: {start: number, end: number}|null}}
 */
function isInsideCodeBlock(position, codeBlocks) {
  for (const block of codeBlocks) {
    if (position > block.start && position < block.end) {
      return { inside: true, block };
    }
  }
  return { inside: false, block: null };
}

/**
 * Find the best point to split text, prioritizing natural boundaries.
 * Priority: code block preservation > paragraphs > lines > sentences > words > hard split
 *
 * @param {string} text - Text to find split point in
 * @param {number} maxLength - Maximum length allowed
 * @returns {number} Index to split at
 */
function findSplitPoint(text, maxLength) {
  const searchArea = text.slice(0, maxLength);
  const minSplitPoint = Math.floor(maxLength * MIN_SPLIT_RATIO);
  const codeBlocks = findCodeBlocks(text);

  // Priority 0: Proactive code block preservation
  // Check if there's a code block we should try to keep intact
  const codeBlockSplit = findCodeBlockPreservingSplit(text, codeBlocks, minSplitPoint, maxLength);
  if (codeBlockSplit !== null) {
    return codeBlockSplit;
  }

  // No code block considerations - find natural split point
  let candidateSplit = findNaturalSplitPoint(searchArea, minSplitPoint, maxLength);

  // Double-check if candidate split is inside a code block (defensive)
  const codeBlockCheck = isInsideCodeBlock(candidateSplit, codeBlocks);

  if (codeBlockCheck.inside) {
    const block = codeBlockCheck.block;

    // If the entire code block fits within maxLength, split before it
    if (block.start >= minSplitPoint) {
      return block.start;
    }

    // Code block starts before minSplitPoint - we must split inside it
    // Find a line boundary within the code block (but within maxLength)
    const blockContent = text.slice(block.start, Math.min(block.end, maxLength));
    const lastNewline = blockContent.lastIndexOf('\n');

    if (lastNewline > 0 && block.start + lastNewline >= minSplitPoint) {
      return block.start + lastNewline + 1;
    }

    // Fallback: split at candidate if no good line boundary found
    return candidateSplit;
  }

  return candidateSplit;
}

/**
 * Find a split point that preserves code block integrity when possible.
 * Returns null if no special handling is needed.
 *
 * Strategy:
 * 1. If a code block ends within maxLength and after minSplitPoint, split after it
 * 2. If a code block starts within searchArea and would be cut, split before it
 * 3. If we're inside a large code block, split at line boundaries within it
 *
 * @param {string} text - Full text being chunked
 * @param {Array<{start: number, end: number}>} codeBlocks - Code block positions
 * @param {number} minSplitPoint - Minimum acceptable split point
 * @param {number} maxLength - Maximum length allowed
 * @returns {number|null} Split point, or null if no special handling needed
 */
function findCodeBlockPreservingSplit(text, codeBlocks, minSplitPoint, maxLength) {
  if (codeBlocks.length === 0) {
    return null;
  }

  // Find code blocks that interact with our search window [0, maxLength]
  for (const block of codeBlocks) {
    // Case 1: Code block ends within our window - prefer splitting right after it
    // This keeps the block intact in the current chunk
    if (block.end <= maxLength && block.end >= minSplitPoint) {
      // Check if there's meaningful content after the block within maxLength
      const afterBlock = text.slice(block.end, maxLength);
      const nextContentStart = afterBlock.search(/\S/);

      // If there's a natural break point right after the code block, use it
      if (nextContentStart !== -1) {
        const breakAfter = block.end + nextContentStart;
        // Look for paragraph/line break right after the code block
        const postBlockText = text.slice(block.end, Math.min(block.end + 50, maxLength));
        const paragraphBreak = postBlockText.indexOf('\n\n');
        if (paragraphBreak !== -1 && paragraphBreak < 10) {
          return block.end + paragraphBreak + 2;
        }
        const lineBreak = postBlockText.indexOf('\n');
        if (lineBreak !== -1 && lineBreak < 5) {
          return block.end + lineBreak + 1;
        }
      }

      // No clear break - split right at block end
      return block.end;
    }

    // Case 2: Code block starts within window but extends beyond maxLength
    // Split before the code block to keep it intact in the next chunk
    if (block.start < maxLength && block.end > maxLength) {
      if (block.start >= minSplitPoint) {
        // Find a good split point before the code block
        const beforeBlock = text.slice(0, block.start);
        const lastParagraph = beforeBlock.lastIndexOf('\n\n');
        if (lastParagraph >= minSplitPoint) {
          return lastParagraph + 2;
        }
        const lastLine = beforeBlock.lastIndexOf('\n');
        if (lastLine >= minSplitPoint) {
          return lastLine + 1;
        }
        // Split right at block start
        return block.start;
      }

      // Block starts before minSplitPoint - we must split inside it
      // Find a line boundary within the code block
      const blockContent = text.slice(block.start, maxLength);
      const lastNewline = blockContent.lastIndexOf('\n');

      if (lastNewline > 0) {
        const splitPoint = block.start + lastNewline + 1;
        if (splitPoint >= minSplitPoint) {
          return splitPoint;
        }
      }
    }

    // Case 3: Code block is entirely beyond maxLength - no action needed for this block
    if (block.start >= maxLength) {
      continue;
    }
  }

  return null;
}

/**
 * Find natural split point without code block consideration.
 * Priority: paragraphs > lines > sentences > words > punctuation > hard split
 *
 * @param {string} searchArea - Text area to search within
 * @param {number} minSplitPoint - Minimum acceptable split point
 * @param {number} maxLength - Maximum length allowed
 * @returns {number} Index to split at
 */
function findNaturalSplitPoint(searchArea, minSplitPoint, maxLength) {
  // Priority 1: Split at paragraph boundary (double newline)
  const paragraphBreak = searchArea.lastIndexOf('\n\n');
  if (paragraphBreak >= minSplitPoint) {
    return paragraphBreak + 2; // Include the double newline
  }

  // Priority 2: Split at single newline
  const lineBreak = searchArea.lastIndexOf('\n');
  if (lineBreak >= minSplitPoint) {
    return lineBreak + 1;
  }

  // Priority 3: Split at sentence boundary
  const sentenceEnd = findLastSentenceEnd(searchArea);
  if (sentenceEnd >= minSplitPoint) {
    return sentenceEnd;
  }

  // Priority 4: Split at word boundary (space, tab, or other whitespace)
  const wordBreak = findLastWordBoundary(searchArea);
  if (wordBreak >= minSplitPoint) {
    return wordBreak;
  }

  // Priority 5: Split at any punctuation (for URLs, compound words)
  const punctBreak = findLastPunctuationBoundary(searchArea);
  if (punctBreak >= minSplitPoint) {
    return punctBreak;
  }

  // Fallback: Hard split at maxLength (last resort for very long words/URLs)
  return maxLength;
}

/**
 * Find the last sentence-ending punctuation followed by whitespace or end.
 * Handles: . ! ? and also ellipsis (...)
 *
 * @param {string} text - Text to search
 * @returns {number} Index after the sentence end, or -1 if not found
 */
function findLastSentenceEnd(text) {
  // Match sentence endings: . ! ? (including ellipsis) followed by space or end
  // Also handles quotes and parentheses after punctuation: ." ?) !"
  const matches = [...text.matchAll(/[.!?]+['")\]]?(?:\s|$)/g)];
  if (matches.length === 0) return -1;

  const lastMatch = matches[matches.length - 1];
  return lastMatch.index + lastMatch[0].length;
}

/**
 * Find the last word boundary (whitespace).
 *
 * @param {string} text - Text to search
 * @returns {number} Index after the whitespace, or -1 if not found
 */
function findLastWordBoundary(text) {
  // Match any whitespace character
  const matches = [...text.matchAll(/\s+/g)];
  if (matches.length === 0) return -1;

  const lastMatch = matches[matches.length - 1];
  return lastMatch.index + lastMatch[0].length;
}

/**
 * Find the last punctuation boundary for splitting compound words/URLs.
 * Useful when there are no spaces but we can split at hyphens, slashes, etc.
 *
 * @param {string} text - Text to search
 * @returns {number} Index after the punctuation, or -1 if not found
 */
function findLastPunctuationBoundary(text) {
  // Match common split points in URLs and compound words: / - _ = & | , ;
  const matches = [...text.matchAll(/[\/\-_=&|,;]+/g)];
  if (matches.length === 0) return -1;

  const lastMatch = matches[matches.length - 1];
  return lastMatch.index + lastMatch[0].length;
}

/**
 * Send a long message in chunks via Telegram API.
 * Splits at natural boundaries and adds continuation indicators.
 *
 * @param {Function} sendFn - Function to send a message: (chatId, text, options) => Promise
 * @param {string|number} chatId - Telegram chat ID to send to
 * @param {string} text - The message text to send
 * @param {Object} options - Optional Telegram message options (parse_mode, etc.)
 * @param {number} maxLength - Maximum characters per chunk (default: 4096)
 * @returns {Promise<Array>} Array of sent message results
 */
export async function sendChunkedMessage(sendFn, chatId, text, options = {}, maxLength = DEFAULT_MAX_LENGTH) {
  // Reserve space for continuation indicator like " (1/10)"
  const reservedSpace = 10;
  const effectiveMax = maxLength - reservedSpace;

  const chunks = chunkMessage(text, effectiveMax);

  if (chunks.length === 0) {
    return [];
  }

  // Single chunk - no indicator needed
  if (chunks.length === 1) {
    const result = await sendFn(chatId, chunks[0], options);
    return [result];
  }

  // Multiple chunks - add continuation indicators and send sequentially
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    const indicator = ` (${i + 1}/${chunks.length})`;
    const chunkWithIndicator = chunks[i] + indicator;

    const result = await sendFn(chatId, chunkWithIndicator, options);
    results.push(result);
  }

  return results;
}

export default { chunkMessage, sendChunkedMessage };
