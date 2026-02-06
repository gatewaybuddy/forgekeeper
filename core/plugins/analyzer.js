/**
 * Plugin Analyzer for Forgekeeper
 *
 * Static analysis of plugin code for security review.
 * Detects network calls, file system access, eval usage,
 * and suspicious patterns.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { createHash } from 'crypto';

// Suspicious patterns to detect
const PATTERNS = {
  // Network access
  network: [
    /\bfetch\s*\(/,
    /\brequire\s*\(\s*['"]https?['"]/,
    /\baxios\b/,
    /\bhttp\./,
    /\bhttps\./,
    /\bnet\./,
    /\bdns\./,
    /\.request\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
  ],

  // File system access
  filesystem: [
    /\bfs\./,
    /\bfs\/promises/,
    /\breadFileSync\b/,
    /\bwriteFileSync\b/,
    /\breadFile\b/,
    /\bwriteFile\b/,
    /\bunlinkSync\b/,
    /\bunlink\b/,
    /\brmSync\b/,
    /\brm\b/,
    /\bmkdirSync\b/,
    /\breaddir\b/,
    /\breaddirSync\b/,
  ],

  // Code execution
  execution: [
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bexec\s*\(/,
    /\bexecSync\s*\(/,
    /\bspawn\s*\(/,
    /\bspawnSync\s*\(/,
    /\bchild_process/,
    /\bvm\./,
    /\bvm2/,
  ],

  // Dangerous globals
  globals: [
    /\bprocess\.exit\b/,
    /\bprocess\.env\b/,
    /\bglobal\./,
    /\bglobalThis\./,
    /\b__dirname\b/,
    /\b__filename\b/,
  ],

  // Encoding/obfuscation (potential hiding)
  obfuscation: [
    /Buffer\.from\s*\([^)]+,\s*['"]base64['"]/,
    /atob\s*\(/,
    /btoa\s*\(/,
    /String\.fromCharCode/,
    /\\x[0-9a-fA-F]{2}/,
    /\\u[0-9a-fA-F]{4}/,
  ],

  // Dynamic requires
  dynamicImport: [
    /require\s*\(\s*[^'"]/,
    /import\s*\(\s*[^'"]/,
    /require\s*\(\s*\$\{/,
    /require\s*\(\s*`/,
  ],
};

// Risk levels
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * Analyze a single file
 */
function analyzeFile(filePath, content) {
  const findings = [];
  const lines = content.split('\n');

  for (const [category, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(pattern);

        if (match) {
          findings.push({
            category,
            pattern: pattern.toString(),
            match: match[0],
            file: filePath,
            line: i + 1,
            context: line.trim().slice(0, 100),
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Collect all JavaScript files from a directory
 */
function collectJsFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        collectJsFiles(fullPath, files);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (['.js', '.mjs', '.cjs', '.ts'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Calculate content hash for tracking changes
 */
function calculateHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Determine overall risk level from findings
 */
function determineRiskLevel(findings) {
  const categoryCounts = {};

  for (const finding of findings) {
    categoryCounts[finding.category] = (categoryCounts[finding.category] || 0) + 1;
  }

  // Critical: execution patterns (eval, exec, child_process)
  if (categoryCounts.execution) {
    return RISK_LEVELS.CRITICAL;
  }

  // High: filesystem + network combined, or dynamic imports
  if ((categoryCounts.filesystem && categoryCounts.network) || categoryCounts.dynamicImport) {
    return RISK_LEVELS.HIGH;
  }

  // Medium: network or filesystem alone, or globals
  if (categoryCounts.network || categoryCounts.filesystem || categoryCounts.globals) {
    return RISK_LEVELS.MEDIUM;
  }

  // Low: only obfuscation patterns
  if (categoryCounts.obfuscation) {
    return RISK_LEVELS.LOW;
  }

  // No concerning patterns found
  return RISK_LEVELS.LOW;
}

/**
 * Generate analysis summary
 */
function generateSummary(findings, riskLevel) {
  const summary = [];

  if (riskLevel === RISK_LEVELS.CRITICAL) {
    summary.push('CRITICAL: Plugin uses code execution patterns (eval/exec/spawn)');
  }

  const categories = new Set(findings.map(f => f.category));

  if (categories.has('network')) {
    summary.push('Network access detected: Plugin may make external requests');
  }

  if (categories.has('filesystem')) {
    summary.push('File system access detected: Plugin may read/write files');
  }

  if (categories.has('execution')) {
    summary.push('Code execution detected: Plugin can run arbitrary code');
  }

  if (categories.has('globals')) {
    summary.push('Global access detected: Plugin accesses process/environment');
  }

  if (categories.has('obfuscation')) {
    summary.push('Encoding patterns detected: Some code may be obfuscated');
  }

  if (categories.has('dynamicImport')) {
    summary.push('Dynamic imports detected: Plugin loads modules dynamically');
  }

  if (summary.length === 0) {
    summary.push('No concerning patterns detected');
  }

  return summary;
}

/**
 * Analyze a plugin directory
 *
 * @param {string} pluginPath - Path to plugin directory
 * @returns {Object} Analysis result
 */
export function analyzePlugin(pluginPath) {
  const allFindings = [];
  let allContent = '';

  try {
    const jsFiles = collectJsFiles(pluginPath);

    for (const filePath of jsFiles) {
      const content = readFileSync(filePath, 'utf-8');
      allContent += content;
      const findings = analyzeFile(filePath.replace(pluginPath, ''), content);
      allFindings.push(...findings);
    }

    const riskLevel = determineRiskLevel(allFindings);
    const summary = generateSummary(allFindings, riskLevel);
    const hash = calculateHash(allContent);

    return {
      success: true,
      pluginPath,
      filesAnalyzed: jsFiles.length,
      findingsCount: allFindings.length,
      findings: allFindings,
      riskLevel,
      summary,
      hash,
      analyzedAt: new Date().toISOString(),
    };

  } catch (err) {
    return {
      success: false,
      pluginPath,
      error: err.message,
    };
  }
}

/**
 * Generate human-readable analysis report
 */
export function generateReport(analysis) {
  if (!analysis.success) {
    return `Analysis failed: ${analysis.error}`;
  }

  const lines = [
    `Plugin Analysis Report`,
    `======================`,
    ``,
    `Risk Level: ${analysis.riskLevel.toUpperCase()}`,
    `Files Analyzed: ${analysis.filesAnalyzed}`,
    `Findings: ${analysis.findingsCount}`,
    ``,
    `Summary:`,
  ];

  for (const item of analysis.summary) {
    lines.push(`  - ${item}`);
  }

  if (analysis.findings.length > 0) {
    lines.push(``);
    lines.push(`Detailed Findings:`);

    // Group by category
    const byCategory = {};
    for (const finding of analysis.findings) {
      if (!byCategory[finding.category]) {
        byCategory[finding.category] = [];
      }
      byCategory[finding.category].push(finding);
    }

    for (const [category, findings] of Object.entries(byCategory)) {
      lines.push(``);
      lines.push(`  ${category.toUpperCase()} (${findings.length} occurrences):`);

      // Show first 5 per category
      for (const finding of findings.slice(0, 5)) {
        lines.push(`    - ${finding.file}:${finding.line}: ${finding.match}`);
      }

      if (findings.length > 5) {
        lines.push(`    ... and ${findings.length - 5} more`);
      }
    }
  }

  lines.push(``);
  lines.push(`Analysis Hash: ${analysis.hash}`);

  return lines.join('\n');
}

/**
 * Check if plugin needs re-analysis (content changed)
 */
export function needsReanalysis(pluginPath, previousHash) {
  try {
    const jsFiles = collectJsFiles(pluginPath);
    let allContent = '';

    for (const filePath of jsFiles) {
      allContent += readFileSync(filePath, 'utf-8');
    }

    const currentHash = calculateHash(allContent);
    return currentHash !== previousHash;

  } catch (err) {
    return true; // If we can't check, assume re-analysis needed
  }
}

export default {
  RISK_LEVELS,
  analyzePlugin,
  generateReport,
  needsReanalysis,
};
