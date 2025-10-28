/**
 * Code Review Service
 *
 * Provides automated code review using LLM with structured output.
 * Inspired by Codex's review mode.
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { contextLogEvents } from '../services/contextlog-events.mjs';
import { ulid } from 'ulid';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} ReviewConfig
 * @property {Function} llmClient - LLM client for chat
 * @property {string} model - Model to use for review
 * @property {string} promptPath - Path to review prompt
 */

/**
 * @typedef {Object} ReviewChange
 * @property {string} file_path - Path to changed file
 * @property {string} diff - Diff content
 * @property {string} [language] - Programming language
 * @property {string} [content] - Full file content (optional)
 */

/**
 * @typedef {Object} ReviewFinding
 * @property {string} file - File path
 * @property {number} [line] - Line number
 * @property {'info'|'warning'|'error'|'critical'} severity - Severity level
 * @property {'correctness'|'security'|'performance'|'best_practice'|'style'} category
 * @property {string} description - Issue description
 * @property {string} recommendation - Fix recommendation
 */

/**
 * @typedef {Object} ReviewResult
 * @property {'approved'|'approved_with_notes'|'changes_requested'|'rejected'} overall_assessment
 * @property {string} overall_explanation - Summary
 * @property {ReviewFinding[]} findings - List of findings
 */

export class ReviewService {
  /**
   * @param {ReviewConfig} config
   */
  constructor(config) {
    this.llmClient = config.llmClient;
    this.model = config.model || 'core';
    this.promptPath = config.promptPath || resolve(__dirname, '../../prompts/review.md');
    this.reviewPrompt = null;
  }

  /**
   * Load review prompt from file
   *
   * @returns {Promise<string>}
   */
  async loadReviewPrompt() {
    if (!this.reviewPrompt) {
      this.reviewPrompt = await readFile(this.promptPath, 'utf-8');
    }
    return this.reviewPrompt;
  }

  /**
   * Review code changes
   *
   * @param {ReviewChange[]} changes - Changes to review
   * @param {string[]} criteria - Review criteria to focus on
   * @param {Object} context - Execution context
   * @returns {Promise<ReviewResult>}
   */
  async reviewChanges(changes, criteria, context) {
    const prompt = await this.loadReviewPrompt();

    // Emit review started event
    await contextLogEvents.emit({
      id: ulid(),
      type: 'review_started',
      ts: new Date().toISOString(),
      conv_id: context.convId,
      turn_id: context.turnId,
      actor: 'system',
      changes_count: changes.length,
      criteria,
    });

    // Build review request
    const messages = [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content: this.buildReviewRequest(changes, criteria),
      },
    ];

    // Call LLM with structured output
    try {
      const response = await this.llmClient.chat({
        model: this.model,
        messages,
        temperature: 0.0, // Deterministic for reviews
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'review_result',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                overall_assessment: {
                  type: 'string',
                  enum: ['approved', 'approved_with_notes', 'changes_requested', 'rejected'],
                },
                overall_explanation: { type: 'string' },
                findings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      file: { type: 'string' },
                      line: { type: 'number' },
                      severity: {
                        type: 'string',
                        enum: ['info', 'warning', 'error', 'critical'],
                      },
                      category: {
                        type: 'string',
                        enum: ['correctness', 'security', 'performance', 'best_practice', 'style'],
                      },
                      description: { type: 'string' },
                      recommendation: { type: 'string' },
                    },
                    required: ['file', 'severity', 'category', 'description', 'recommendation'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['overall_assessment', 'overall_explanation', 'findings'],
              additionalProperties: false,
            },
          },
        },
      });

      const result = JSON.parse(response.choices[0].message.content);

      // Emit review completed event
      await contextLogEvents.emitReviewCompleted(
        context.convId,
        context.turnId,
        result
      );

      return result;

    } catch (error) {
      console.error('Review failed:', error);

      // Emit error event
      await contextLogEvents.emitError(context.convId, context.turnId, error);

      throw error;
    }
  }

  /**
   * Build review request message
   *
   * @param {ReviewChange[]} changes
   * @param {string[]} criteria
   * @returns {string}
   */
  buildReviewRequest(changes, criteria) {
    const criteriaList = criteria.length > 0
      ? criteria.join(', ')
      : 'all criteria (correctness, security, performance, best practices, style)';

    let request = `## Review Request

Please review the following changes according to: **${criteriaList}**

Focus on identifying issues in these areas and provide actionable recommendations.

`;

    // Add each change
    for (const change of changes) {
      request += `---

### File: \`${change.file_path}\`
`;

      if (change.language) {
        request += `Language: ${change.language}\n\n`;
      }

      request += `#### Changes:\n\n`;
      request += '```' + (change.language || '') + '\n';
      request += change.diff;
      request += '\n```\n\n';

      if (change.content) {
        request += `#### Full File Content:\n\n`;
        request += '```' + (change.language || '') + '\n';
        request += change.content;
        request += '\n```\n\n';
      }
    }

    request += `---

Provide a structured review with findings and recommendations in JSON format.`;

    return request;
  }

  /**
   * Review a single file
   *
   * @param {string} filePath - Path to file
   * @param {string} content - File content
   * @param {string[]} criteria - Review criteria
   * @param {Object} context - Execution context
   * @returns {Promise<ReviewResult>}
   */
  async reviewFile(filePath, content, criteria, context) {
    const language = this.detectLanguage(filePath);

    const change = {
      file_path: filePath,
      content,
      language,
      diff: content, // For full file review, diff is entire content
    };

    return await this.reviewChanges([change], criteria, context);
  }

  /**
   * Review diff between two versions
   *
   * @param {string} filePath - Path to file
   * @param {string} oldContent - Original content
   * @param {string} newContent - New content
   * @param {string[]} criteria - Review criteria
   * @param {Object} context - Execution context
   * @returns {Promise<ReviewResult>}
   */
  async reviewDiff(filePath, oldContent, newContent, criteria, context) {
    const language = this.detectLanguage(filePath);
    const diff = this.createDiff(oldContent, newContent);

    const change = {
      file_path: filePath,
      diff,
      language,
      content: newContent, // Include full new content for context
    };

    return await this.reviewChanges([change], criteria, context);
  }

  /**
   * Detect programming language from file path
   *
   * @param {string} filePath
   * @returns {string}
   */
  detectLanguage(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();

    const languageMap = {
      'js': 'javascript',
      'mjs': 'javascript',
      'cjs': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'sh': 'bash',
      'bash': 'bash',
      'sql': 'sql',
      'md': 'markdown',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
    };

    return languageMap[ext] || 'text';
  }

  /**
   * Create unified diff between old and new content
   *
   * @param {string} oldContent
   * @param {string} newContent
   * @returns {string}
   */
  createDiff(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let diff = '';

    // Simple line-by-line diff (for production, use a proper diff library)
    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine !== newLine) {
        if (oldLine !== undefined) {
          diff += `- ${oldLine}\n`;
        }
        if (newLine !== undefined) {
          diff += `+ ${newLine}\n`;
        }
      } else if (oldLine !== undefined) {
        diff += `  ${oldLine}\n`;
      }
    }

    return diff;
  }

  /**
   * Filter findings by severity
   *
   * @param {ReviewResult} review
   * @param {string[]} severities - Severities to include
   * @returns {ReviewFinding[]}
   */
  filterBySeverity(review, severities) {
    return review.findings.filter(f => severities.includes(f.severity));
  }

  /**
   * Group findings by file
   *
   * @param {ReviewResult} review
   * @returns {Map<string, ReviewFinding[]>}
   */
  groupByFile(review) {
    const grouped = new Map();

    for (const finding of review.findings) {
      if (!grouped.has(finding.file)) {
        grouped.set(finding.file, []);
      }
      grouped.get(finding.file).push(finding);
    }

    return grouped;
  }

  /**
   * Get findings summary statistics
   *
   * @param {ReviewResult} review
   * @returns {Object}
   */
  getStats(review) {
    const stats = {
      total: review.findings.length,
      by_severity: {
        critical: 0,
        error: 0,
        warning: 0,
        info: 0,
      },
      by_category: {
        security: 0,
        correctness: 0,
        performance: 0,
        best_practice: 0,
        style: 0,
      },
    };

    for (const finding of review.findings) {
      stats.by_severity[finding.severity]++;
      stats.by_category[finding.category]++;
    }

    return stats;
  }
}

/**
 * Create default review service instance
 *
 * @param {ReviewConfig} config
 * @returns {ReviewService}
 */
export function createReviewService(config) {
  return new ReviewService(config);
}
