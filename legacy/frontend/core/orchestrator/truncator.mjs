/**
 * Output Truncator
 *
 * Truncates large tool outputs to prevent context window overflow.
 * Inspired by Codex's output formatting strategy.
 *
 * Strategy: Head+Tail
 * - Shows beginning and end of output
 * - Includes elision marker with count
 * - Preserves structural information
 */

/**
 * @typedef {Object} TruncationConfig
 * @property {number} maxBytes - Maximum bytes to keep (default: 10240 = 10KB)
 * @property {number} maxLines - Maximum lines to keep (default: 256)
 * @property {'head-tail' | 'head-only'} strategy - Truncation strategy
 */

/**
 * @typedef {Object} ToolLimit
 * @property {number} bytes - Max bytes for this tool
 * @property {number} lines - Max lines for this tool
 */

export class OutputTruncator {
  /**
   * @param {TruncationConfig} config
   */
  constructor(config = {}) {
    this.maxBytes = config.maxBytes || 10240; // 10KB default
    this.maxLines = config.maxLines || 256;
    this.strategy = config.strategy || 'head-tail';

    // Tool-specific limits
    this.toolLimits = {
      'run_bash': { bytes: 20480, lines: 512 },     // 20KB for shell
      'run_powershell': { bytes: 20480, lines: 512 },
      'read_file': { bytes: 65536, lines: 2000 },   // 64KB for files
      'list_dir': { bytes: 20480, lines: 512 },     // 20KB for directory listings
      'grep': { bytes: 32768, lines: 1000 },        // 32KB for search results
      'default': { bytes: this.maxBytes, lines: this.maxLines },
    };
  }

  /**
   * Truncate output if it exceeds limits
   *
   * @param {string} output - Tool output to truncate
   * @param {string} toolName - Name of tool (for tool-specific limits)
   * @returns {{ content: string, truncated: boolean, originalBytes: number }}
   */
  truncate(output, toolName = 'default') {
    if (!output || typeof output !== 'string') {
      return {
        content: output || '',
        truncated: false,
        originalBytes: 0,
      };
    }

    const originalBytes = Buffer.byteLength(output, 'utf8');
    const limit = this.getToolLimit(toolName);

    // Check if truncation needed
    if (originalBytes <= limit.bytes) {
      return {
        content: output,
        truncated: false,
        originalBytes,
      };
    }

    // Apply truncation strategy
    let truncated;
    switch (this.strategy) {
      case 'head-tail':
        truncated = this.headTailTruncate(output, limit);
        break;
      case 'head-only':
        truncated = this.headOnlyTruncate(output, limit);
        break;
      default:
        truncated = this.headTailTruncate(output, limit);
    }

    return {
      content: truncated,
      truncated: true,
      originalBytes,
    };
  }

  /**
   * Head+Tail truncation: show beginning and end
   *
   * @param {string} output
   * @param {ToolLimit} limit
   * @returns {string}
   */
  headTailTruncate(output, limit) {
    const lines = output.split('\n');

    // First try line-based truncation
    if (lines.length > limit.lines) {
      const headLines = Math.floor(limit.lines / 2);
      const tailLines = limit.lines - headLines;
      const elidedLines = lines.length - limit.lines;

      return [
        ...lines.slice(0, headLines),
        '',
        `... (${elidedLines} lines elided) ...`,
        '',
        ...lines.slice(-tailLines),
      ].join('\n');
    }

    // Byte-based truncation
    const headBytes = Math.floor(limit.bytes / 2);
    const tailBytes = limit.bytes - headBytes;

    const head = this.sliceUtf8(output, 0, headBytes);
    const tail = this.sliceUtf8(output, output.length - tailBytes);

    const elidedBytes = Buffer.byteLength(output, 'utf8') - limit.bytes;

    return `${head}\n\n... (${this.formatBytes(elidedBytes)} elided) ...\n\n${tail}`;
  }

  /**
   * Head-only truncation: show beginning only
   *
   * @param {string} output
   * @param {ToolLimit} limit
   * @returns {string}
   */
  headOnlyTruncate(output, limit) {
    const lines = output.split('\n');

    // Line-based truncation
    if (lines.length > limit.lines) {
      const elidedLines = lines.length - limit.lines;

      return [
        ...lines.slice(0, limit.lines),
        '',
        `... (${elidedLines} more lines) ...`,
      ].join('\n');
    }

    // Byte-based truncation
    const truncated = this.sliceUtf8(output, 0, limit.bytes);
    const elidedBytes = Buffer.byteLength(output, 'utf8') - limit.bytes;

    return `${truncated}\n\n... (${this.formatBytes(elidedBytes)} more) ...`;
  }

  /**
   * Get tool-specific limit
   *
   * @param {string} toolName
   * @returns {ToolLimit}
   */
  getToolLimit(toolName) {
    return this.toolLimits[toolName] || this.toolLimits.default;
  }

  /**
   * Safely slice UTF-8 string by byte count
   * Avoids breaking multi-byte characters
   *
   * @param {string} str
   * @param {number} start
   * @param {number} end
   * @returns {string}
   */
  sliceUtf8(str, start, end) {
    const buffer = Buffer.from(str, 'utf8');
    const sliced = buffer.slice(start, end);

    // Decode and handle potential incomplete characters
    let decoded = sliced.toString('utf8');

    // Remove trailing incomplete character if present
    // (Incomplete characters appear as � U+FFFD)
    if (decoded.endsWith('\ufffd')) {
      decoded = decoded.slice(0, -1);
    }

    return decoded;
  }

  /**
   * Format byte count for display
   *
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes < 1024) {
      return `${bytes} bytes`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  /**
   * Set tool-specific limit
   *
   * @param {string} toolName
   * @param {ToolLimit} limit
   */
  setToolLimit(toolName, limit) {
    this.toolLimits[toolName] = limit;
  }

  /**
   * Get statistics about truncation
   *
   * @param {string} original
   * @param {string} truncated
   * @returns {{ savedBytes: number, savedPercent: number }}
   */
  getStats(original, truncated) {
    const originalBytes = Buffer.byteLength(original, 'utf8');
    const truncatedBytes = Buffer.byteLength(truncated, 'utf8');
    const savedBytes = originalBytes - truncatedBytes;
    const savedPercent = (savedBytes / originalBytes) * 100;

    return {
      savedBytes,
      savedPercent,
      originalBytes,
      truncatedBytes,
    };
  }
}

/**
 * Create default truncator instance
 */
export function createTruncator(config) {
  return new OutputTruncator(config);
}
