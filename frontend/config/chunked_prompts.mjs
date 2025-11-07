// Chunked reasoning prompt templates for breaking down complex responses
// Provides prompt builders for outline generation and chunk-by-chunk writing

/**
 * Build an outline generation prompt for Harmony protocol models.
 * This prompt asks the model to break down the user's question into logical chunks.
 *
 * @param {string} userQuestion - Original user question
 * @param {number} maxChunks - Maximum number of chunks to generate (default 5)
 * @returns {Array<Object>} Messages array for Harmony protocol
 */
export function buildHarmonyOutlinePrompt(userQuestion, maxChunks = 5) {
  const systemMessage = [
    'You are a response planner. Break down complex questions into logical sections for comprehensive coverage.',
    `Generate ${maxChunks} or fewer chunks, each representing a distinct aspect or section of the response.`,
  ].join('\n');

  const userMessage = [
    'User question:',
    userQuestion,
    '',
    'Break this down into 3-5 logical chunks or sections. For each chunk, provide:',
    '1. A brief label (2-5 words)',
    '2. A one-sentence description of what this chunk should cover',
    '',
    'Format your response as:',
    'Chunk 1: [Label] - [Description]',
    'Chunk 2: [Label] - [Description]',
    '...',
    '',
    'Keep labels concise and descriptive.',
  ].join('\n');

  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build an outline generation prompt for OpenAI-style models.
 *
 * @param {string} userQuestion - Original user question
 * @param {number} maxChunks - Maximum number of chunks to generate
 * @returns {Array<Object>} Messages array for OpenAI protocol
 */
export function buildOpenAIOutlinePrompt(userQuestion, maxChunks = 5) {
  // Same structure works for OpenAI-style APIs
  return buildHarmonyOutlinePrompt(userQuestion, maxChunks);
}

/**
 * Build a chunk writing prompt for Harmony protocol.
 * This prompt asks the model to reason about and write a specific chunk.
 *
 * @param {string} userQuestion - Original user question
 * @param {string} chunkLabel - Label of the current chunk to write
 * @param {number} chunkIndex - Index of current chunk (0-based)
 * @param {number} totalChunks - Total number of chunks
 * @param {string} accumulatedResponse - Previously written chunks (optional)
 * @param {Array<string>} outline - Full outline of all chunks (optional)
 * @returns {Array<Object>} Messages array for Harmony protocol
 */
export function buildHarmonyChunkPrompt(
  userQuestion,
  chunkLabel,
  chunkIndex,
  totalChunks,
  accumulatedResponse = '',
  outline = []
) {
  const systemMessage = [
    'You are writing a comprehensive response in chunks.',
    `Current chunk: ${chunkIndex + 1} of ${totalChunks} - "${chunkLabel}"`,
    'First reason about this section, then write its content.',
  ].join('\n');

  const parts = ['Original question:', userQuestion, ''];

  if (outline.length > 0) {
    parts.push('Full outline:');
    outline.forEach((label, idx) => {
      const marker = idx === chunkIndex ? '→' : ' ';
      parts.push(`${marker} ${idx + 1}. ${label}`);
    });
    parts.push('');
  }

  if (accumulatedResponse) {
    parts.push('Previously written:', accumulatedResponse, '');
  }

  parts.push(
    `Current section to address: ${chunkLabel}`,
    '',
    'Instructions:',
    '1. First, in the <analysis> channel, reason about what to include in this section',
    '2. Then, in the <final> channel, write this section\'s content',
    '3. Focus ONLY on this section - do not repeat previous content',
    '4. Ensure smooth transition from previous section if applicable',
  );

  const userMessage = parts.join('\n');

  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build a chunk writing prompt for OpenAI-style models.
 *
 * @param {string} userQuestion - Original user question
 * @param {string} chunkLabel - Label of the current chunk
 * @param {number} chunkIndex - Index of current chunk
 * @param {number} totalChunks - Total number of chunks
 * @param {string} accumulatedResponse - Previously written chunks
 * @param {Array<string>} outline - Full outline
 * @returns {Array<Object>} Messages array for OpenAI protocol
 */
export function buildOpenAIChunkPrompt(
  userQuestion,
  chunkLabel,
  chunkIndex,
  totalChunks,
  accumulatedResponse = '',
  outline = []
) {
  // For OpenAI models, we need to adapt the Harmony two-channel approach
  // We'll use a single message but structure it to encourage reasoning first
  const systemMessage = [
    'You are writing a comprehensive response in chunks.',
    `Current chunk: ${chunkIndex + 1} of ${totalChunks} - "${chunkLabel}"`,
    'Structure your response as: [Reasoning] followed by [Content]',
  ].join('\n');

  const parts = ['Original question:', userQuestion, ''];

  if (outline.length > 0) {
    parts.push('Full outline:');
    outline.forEach((label, idx) => {
      const marker = idx === chunkIndex ? '→' : ' ';
      parts.push(`${marker} ${idx + 1}. ${label}`);
    });
    parts.push('');
  }

  if (accumulatedResponse) {
    parts.push('Previously written:', accumulatedResponse, '');
  }

  parts.push(
    `Current section to address: ${chunkLabel}`,
    '',
    'Instructions:',
    '1. Start with "REASONING:" and briefly explain what to cover in this section',
    '2. Then write "CONTENT:" followed by this section\'s actual content',
    '3. Focus ONLY on this section - do not repeat previous content',
    '4. Ensure smooth transition from previous section if applicable',
  );

  const userMessage = parts.join('\n');

  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Parse outline response into an array of chunk labels.
 * Looks for patterns like "Chunk 1: Label - Description"
 *
 * @param {string} outlineText - The model's outline response
 * @returns {Array<string>} Array of chunk labels
 */
export function parseOutline(outlineText) {
  if (!outlineText || typeof outlineText !== 'string') return [];

  const lines = outlineText.split('\n').filter(line => line.trim());
  const chunks = [];

  for (const line of lines) {
    // Pattern 1: "Chunk 1: Label - Description"
    const pattern1 = /chunk\s+\d+\s*:\s*([^-\n]+)(?:\s*-\s*.*)?/i;
    const match1 = line.match(pattern1);
    if (match1 && match1[1]) {
      chunks.push(match1[1].trim());
      continue;
    }

    // Pattern 2: "1. Label - Description" or "1) Label"
    const pattern2 = /^\d+[\.)]\s*([^-\n]+)(?:\s*-\s*.*)?/;
    const match2 = line.match(pattern2);
    if (match2 && match2[1]) {
      chunks.push(match2[1].trim());
      continue;
    }

    // Pattern 3: "- Label" or "• Label"
    const pattern3 = /^[-•]\s*([^-\n]+)(?:\s*-\s*.*)?/;
    const match3 = line.match(pattern3);
    if (match3 && match3[1]) {
      chunks.push(match3[1].trim());
      continue;
    }
  }

  return chunks;
}

/**
 * Extract reasoning and content from a chunk response.
 * For Harmony: extracts from analysis and final channels.
 * For OpenAI: extracts from REASONING: and CONTENT: markers.
 *
 * @param {string} chunkText - The model's chunk response
 * @param {boolean} isHarmony - Whether this is a Harmony model response
 * @returns {Object} Object with { reasoning, content }
 */
export function extractChunkParts(chunkText, isHarmony = false) {
  if (!chunkText || typeof chunkText !== 'string') {
    return { reasoning: '', content: chunkText || '' };
  }

  if (isHarmony) {
    // For Harmony, channels should already be separated by the harmony module
    // This function is just for fallback parsing
    const analysisMatch = chunkText.match(/<analysis>(.*?)<\/analysis>/s);
    const finalMatch = chunkText.match(/<final>(.*?)<\/final>/s);

    return {
      reasoning: analysisMatch ? analysisMatch[1].trim() : '',
      content: finalMatch ? finalMatch[1].trim() : chunkText,
    };
  } else {
    // For OpenAI-style, look for REASONING: and CONTENT: markers
    const reasoningPattern = /REASONING\s*:\s*(.*?)(?=CONTENT\s*:|$)/is;
    const contentPattern = /CONTENT\s*:\s*(.*)/is;

    const reasoningMatch = chunkText.match(reasoningPattern);
    const contentMatch = chunkText.match(contentPattern);

    return {
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
      content: contentMatch ? contentMatch[1].trim() : chunkText,
    };
  }
}

/**
 * Get chunked reasoning configuration from environment variables with defaults.
 *
 * @returns {Object} Configuration object
 */
export function getChunkedConfig() {
  return {
    enabled: (process.env.FRONTEND_ENABLE_CHUNKED || '0') === '1',
    maxChunks: Number(process.env.FRONTEND_CHUNKED_MAX_CHUNKS || '5'),
    tokensPerChunk: Number(process.env.FRONTEND_CHUNKED_TOKENS_PER_CHUNK || '1024'),
    autoThreshold: Number(process.env.FRONTEND_CHUNKED_AUTO_THRESHOLD || '2048'),
    autoOutline: (process.env.FRONTEND_CHUNKED_AUTO_OUTLINE || '1') === '1',
    outlineRetries: Number(process.env.FRONTEND_CHUNKED_OUTLINE_RETRIES || '2'),
    outlineTokens: Number(process.env.FRONTEND_CHUNKED_OUTLINE_TOKENS || '512'),
    reviewPerChunk: (process.env.FRONTEND_CHUNKED_REVIEW_PER_CHUNK || '0') === '1',
  };
}

/**
 * Determine if chunking should be triggered based on context.
 *
 * @param {Object} context - Context object with question, expectedTokens, etc.
 * @param {Object} config - Chunked configuration
 * @returns {boolean} Whether to trigger chunked mode
 */
export function shouldTriggerChunking(context = {}, config = null) {
  const cfg = config || getChunkedConfig();

  if (!cfg.enabled) return false;

  // Check if expected response length exceeds threshold
  const expectedTokens = context.expectedTokens || context.maxTokens || 0;
  if (expectedTokens > cfg.autoThreshold) return true;

  // Check for keywords that suggest comprehensive response
  const question = (context.question || '').toLowerCase();
  const chunkingKeywords = [
    'comprehensive',
    'detailed explanation',
    'step by step',
    'in depth',
    'thorough',
    'complete guide',
    'explain everything',
    'cover all',
    'multiple parts',
    'several aspects',
  ];

  return chunkingKeywords.some(kw => question.includes(kw));
}

/**
 * Estimate token count for a string (rough approximation).
 * Uses character count / 4 as a simple heuristic.
 *
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}
