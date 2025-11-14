/**
 * Documentation Gap Analyzer
 *
 * Detects features, tools, or APIs that lack adequate documentation based on:
 * - Frequent tool usage without corresponding docs
 * - Error patterns suggesting missing documentation
 * - User questions about undocumented features
 */

import { BaseAnalyzer } from '../analyzer.mjs';
import { TaskType, Severity } from '../taskcard.mjs';
import { getToolExecutions, groupBy, getTopN } from '../contextlog-helpers.mjs';

export class DocsGapAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({
      minUsageCount: 20,        // Minimum tool calls to consider
      docsExistThreshold: 0.1,  // If <10% have docs, flag it
      criticalUsage: 100,        // 100+ calls is critical
      highUsage: 50,             // 50+ calls is high priority
      ...config,
    });
  }

  async analyze(context) {
    const { contextLog, timeWindow } = context;

    // Get all tool executions
    const toolCalls = getToolExecutions(contextLog);

    if (toolCalls.length < this.config.minUsageCount) {
      this.log('info', `Only ${toolCalls.length} tool calls (threshold: ${this.config.minUsageCount})`);
      return null;
    }

    // Group by tool name
    const toolsByName = groupBy(toolCalls, 'name');

    // Find top tools by usage
    const topTools = getTopN(toolCalls, 'name', 10);

    // Check for documentation gaps
    const gaps = await this.findDocsGaps(topTools, toolsByName);

    if (gaps.length === 0) {
      this.log('info', 'No significant documentation gaps detected');
      return null;
    }

    // Pick the most critical gap
    const topGap = gaps[0];

    // Determine severity based on usage frequency
    const severity = topGap.count >= this.config.criticalUsage ? Severity.CRITICAL :
                     topGap.count >= this.config.highUsage ? Severity.HIGH :
                     Severity.MEDIUM;

    // Get sample tool calls
    const samples = toolsByName[topGap.tool].slice(0, 3).map(e => ({
      timestamp: e.ts,
      tool: e.name,
      args: e.args_preview,
      status: e.status,
    }));

    // Determine affected files
    const affectedFiles = this.determineDocsFiles(topGap.tool);

    // Create task card
    return this.createTask({
      type: TaskType.DOCUMENTATION_GAP,
      severity,
      title: `Add documentation for heavily-used '${topGap.tool}' tool (${topGap.count} calls)`,
      description: `The '${topGap.tool}' tool has been called ${topGap.count} times in the last ${Math.round(timeWindow.durationMs / 60000)} minutes, but lacks adequate documentation. This creates friction for users and increases support burden.`,
      evidence: {
        metric: 'tool_usage_without_docs',
        tool: topGap.tool,
        callCount: topGap.count,
        timeWindow: `${Math.round(timeWindow.durationMs / 60000)} minutes`,
        samples,
        details: {
          topTools: topTools.slice(0, 5).map(t => `${t.value} (${t.count})`),
          totalToolCalls: toolCalls.length,
          uniqueTools: Object.keys(toolsByName).length,
          docsGaps: gaps.length,
        },
      },
      suggestedFix: {
        approach: 'add_comprehensive_docs',
        files: affectedFiles,
        changes: [
          `Add detailed documentation for '${topGap.tool}' tool`,
          'Include usage examples and common patterns',
          'Document all parameters with types and defaults',
          'Add error handling guidance',
          'Include troubleshooting section',
        ],
        estimatedEffort: '30-60 minutes',
      },
      acceptanceCriteria: [
        `Documentation exists for '${topGap.tool}' with at least 3 usage examples`,
        'All parameters documented with types, defaults, and constraints',
        'Error scenarios and troubleshooting guidance included',
        'Peer review confirms docs are clear and comprehensive',
      ],
      confidence: Math.min(0.95, 0.6 + (topGap.count / this.config.criticalUsage) * 0.3),
      metadata: {
        relatedEvents: toolsByName[topGap.tool].slice(0, 10).map(e => e.id),
      },
    });
  }

  /**
   * Find tools with documentation gaps
   *
   * @param {Array} topTools - Top tools by usage
   * @param {Object} toolsByName - Tools grouped by name
   * @returns {Array<Object>} Gaps with { tool, count, reason }
   */
  async findDocsGaps(topTools, toolsByName) {
    const gaps = [];

    for (const { value: toolName, count } of topTools) {
      // Check if tool has documentation
      const hasDocs = await this.checkToolDocs(toolName);

      if (!hasDocs) {
        gaps.push({
          tool: toolName,
          count,
          reason: 'no_documentation',
        });
      }
    }

    // Sort by usage count (descending)
    return gaps.sort((a, b) => b.count - a.count);
  }

  /**
   * Check if a tool has documentation
   *
   * @param {string} toolName - Tool name
   * @returns {Promise<boolean>} True if docs exist
   */
  async checkToolDocs(toolName) {
    // Heuristic: Check for common documentation patterns
    // In a real implementation, this would scan docs/ directory or check tool metadata

    const wellDocumented = [
      'get_time',
      'echo',
      'read_file',
      'write_file',
      'list_directory',
    ];

    return wellDocumented.includes(toolName);
  }

  /**
   * Determine documentation files to update
   *
   * @param {string} toolName - Tool name
   * @returns {Array<string>} Documentation files
   */
  determineDocsFiles(toolName) {
    const files = [
      'docs/api/tools.md',
      `docs/tools/${toolName}.md`,
    ];

    // Add tool implementation file
    if (toolName.includes('_')) {
      // e.g., read_file -> filesystem.mjs
      const category = this.categorizeToolName(toolName);
      files.push(`frontend/tools/${category}.mjs`);
    }

    return files;
  }

  /**
   * Categorize tool name to implementation file
   *
   * @param {string} toolName - Tool name
   * @returns {string} Category (file prefix)
   */
  categorizeToolName(toolName) {
    if (toolName.includes('file') || toolName.includes('dir')) {
      return 'filesystem';
    }
    if (toolName.includes('bash') || toolName.includes('shell')) {
      return 'shell';
    }
    if (toolName.includes('http') || toolName.includes('fetch')) {
      return 'network';
    }
    if (toolName.includes('git')) {
      return 'git';
    }
    return 'misc';
  }
}

export default DocsGapAnalyzer;
