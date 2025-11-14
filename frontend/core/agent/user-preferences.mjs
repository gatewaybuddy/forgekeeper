/**
 * User Preference Learning System (Phase 5, Option D)
 *
 * Learns and applies user-specific preferences for:
 * - Coding style (indentation, quotes, docstrings)
 * - Tool choices (pytest vs unittest, npm vs yarn)
 * - Workflow patterns (test location, commit style)
 * - Documentation style (verbose vs minimal)
 */

import fs from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';

/**
 * @typedef {Object} UserPreference
 * @property {string} preference_id
 * @property {string} user_id
 * @property {string} domain - coding_style, tool_choice, workflow, testing, documentation
 * @property {string} category
 * @property {string} preference
 * @property {any} value
 * @property {number} confidence - 0.0 to 1.0
 * @property {'explicit'|'inferred'|'observed'} source
 * @property {number} observation_count
 * @property {string} last_observed
 * @property {string} created_at
 * @property {Object} [applies_to]
 */

/**
 * @typedef {Object} PreferenceObservation
 * @property {string} observation_id
 * @property {string} domain
 * @property {string} category
 * @property {any} value
 * @property {Object} evidence
 * @property {number} confidence
 * @property {string} timestamp
 */

export class UserPreferenceSystem {
  constructor(preferencesDir = '.forgekeeper/preferences', userId = 'default_user') {
    this.preferencesDir = preferencesDir;
    this.userId = userId;
    this.preferenceFile = path.join(preferencesDir, 'user_preferences.jsonl');
    this.observationFile = path.join(preferencesDir, 'observations.jsonl');

    // Cache for fast lookups
    this.preferenceCache = new Map();
    this.cacheLoaded = false;
  }

  /**
   * Initialize preference system (create directories)
   */
  async initialize() {
    try {
      await fs.mkdir(this.preferencesDir, { recursive: true });
      console.log(`[UserPreferences] Initialized at ${this.preferencesDir}`);
    } catch (error) {
      console.error('[UserPreferences] Failed to initialize:', error);
    }
  }

  /**
   * Record an explicit user preference
   */
  async recordPreference(domain, category, value, appliesTo = null) {
    const preference = {
      preference_id: ulid(),
      user_id: this.userId,
      domain,
      category,
      preference: category,
      value,
      confidence: 1.0, // Explicit = 100% confidence
      source: 'explicit',
      observation_count: 1,
      last_observed: new Date().toISOString(),
      created_at: new Date().toISOString(),
      applies_to: appliesTo,
    };

    // Check if preference already exists
    const existing = await this.findPreference(domain, category);

    if (existing) {
      // Update existing preference
      preference.preference_id = existing.preference_id;
      preference.created_at = existing.created_at;
      preference.observation_count = existing.observation_count + 1;

      // Replace in file (read all, update, write back)
      await this.updatePreferenceInFile(preference);
    } else {
      // Append new preference
      await this.appendPreference(preference);
    }

    // Update cache
    const key = `${domain}:${category}`;
    this.preferenceCache.set(key, preference);

    console.log(`[UserPreferences] Recorded ${domain}/${category} = ${JSON.stringify(value)}`);
    return preference;
  }

  /**
   * Record an inferred preference from observations
   */
  async recordInferredPreference(domain, category, value, evidence, confidence) {
    const existing = await this.findPreference(domain, category);

    // Only record if confidence is high enough or we have multiple observations
    if (confidence < 0.6 && !existing) {
      console.log(`[UserPreferences] Skipping low-confidence inference: ${domain}/${category} (${confidence})`);
      return null;
    }

    const preference = {
      preference_id: existing?.preference_id || ulid(),
      user_id: this.userId,
      domain,
      category,
      preference: category,
      value,
      confidence: existing ? Math.max(existing.confidence, confidence) : confidence,
      source: 'inferred',
      observation_count: existing ? existing.observation_count + 1 : 1,
      last_observed: new Date().toISOString(),
      created_at: existing?.created_at || new Date().toISOString(),
    };

    if (existing) {
      await this.updatePreferenceInFile(preference);
    } else {
      await this.appendPreference(preference);
    }

    // Update cache
    const key = `${domain}:${category}`;
    this.preferenceCache.set(key, preference);

    // Record observation
    await this.recordObservation({
      observation_id: ulid(),
      domain,
      category,
      value,
      evidence,
      confidence,
      timestamp: new Date().toISOString(),
    });

    console.log(`[UserPreferences] Inferred ${domain}/${category} = ${JSON.stringify(value)} (confidence: ${confidence})`);
    return preference;
  }

  /**
   * Find a specific preference
   */
  async findPreference(domain, category) {
    // Check cache first
    if (this.cacheLoaded) {
      const key = `${domain}:${category}`;
      return this.preferenceCache.get(key) || null;
    }

    // Load from file
    await this.loadCache();
    const key = `${domain}:${category}`;
    return this.preferenceCache.get(key) || null;
  }

  /**
   * Get all preferences for a domain
   */
  async getPreferencesByDomain(domain) {
    await this.loadCache();
    const preferences = [];

    for (const [key, pref] of this.preferenceCache.entries()) {
      if (pref.domain === domain) {
        preferences.push(pref);
      }
    }

    return preferences;
  }

  /**
   * Get all preferences
   */
  async getAllPreferences() {
    await this.loadCache();
    return Array.from(this.preferenceCache.values());
  }

  /**
   * Infer preferences from a code file
   */
  async inferPreferencesFromCode(filePath, content) {
    const ext = path.extname(filePath);
    const observations = [];

    // Python code analysis
    if (ext === '.py') {
      observations.push(...this.analyzePythonCode(filePath, content));
    }

    // JavaScript/TypeScript analysis
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      observations.push(...this.analyzeJavaScriptCode(filePath, content));
    }

    // JSON analysis (for config files)
    if (['.json', 'package.json', 'tsconfig.json'].includes(path.basename(filePath))) {
      observations.push(...this.analyzeConfigFile(filePath, content));
    }

    // Record all observations
    for (const obs of observations) {
      await this.recordInferredPreference(
        obs.domain,
        obs.category,
        obs.value,
        obs.evidence,
        obs.confidence
      );
    }

    return observations;
  }

  /**
   * Analyze Python code for preferences
   */
  analyzePythonCode(filePath, content) {
    const observations = [];

    // Indentation preference
    const has4Spaces = /^ {4}/m.test(content);
    const has2Spaces = /^ {2}/m.test(content);
    const hasTabs = /^\t/m.test(content);

    if (has4Spaces && !hasTabs && !has2Spaces) {
      observations.push({
        domain: 'coding_style',
        category: 'indentation',
        value: '4_spaces',
        evidence: { file: filePath, pattern: '4-space indentation' },
        confidence: 0.9,
      });
    } else if (has2Spaces && !hasTabs && !has4Spaces) {
      observations.push({
        domain: 'coding_style',
        category: 'indentation',
        value: '2_spaces',
        evidence: { file: filePath, pattern: '2-space indentation' },
        confidence: 0.9,
      });
    } else if (hasTabs) {
      observations.push({
        domain: 'coding_style',
        category: 'indentation',
        value: 'tabs',
        evidence: { file: filePath, pattern: 'tab indentation' },
        confidence: 0.9,
      });
    }

    // Docstring style
    const hasGoogleStyle = /""".*\n\s*Args:/m.test(content);
    const hasNumpyStyle = /""".*\n\s*Parameters\n\s*----------/m.test(content);
    const hasSphinxStyle = /""".*\n\s*:param /m.test(content);

    if (hasGoogleStyle) {
      observations.push({
        domain: 'coding_style',
        category: 'docstring_style',
        value: 'google',
        evidence: { file: filePath, pattern: 'Google-style docstrings (Args:)' },
        confidence: 0.95,
      });
    } else if (hasNumpyStyle) {
      observations.push({
        domain: 'coding_style',
        category: 'docstring_style',
        value: 'numpy',
        evidence: { file: filePath, pattern: 'NumPy-style docstrings (Parameters)' },
        confidence: 0.95,
      });
    } else if (hasSphinxStyle) {
      observations.push({
        domain: 'coding_style',
        category: 'docstring_style',
        value: 'sphinx',
        evidence: { file: filePath, pattern: 'Sphinx-style docstrings (:param)' },
        confidence: 0.95,
      });
    }

    // Quote style
    const singleQuotes = (content.match(/'/g) || []).length;
    const doubleQuotes = (content.match(/"/g) || []).length;

    if (singleQuotes > doubleQuotes * 1.5) {
      observations.push({
        domain: 'coding_style',
        category: 'quote_style',
        value: 'single',
        evidence: {
          file: filePath,
          pattern: `${singleQuotes} single vs ${doubleQuotes} double quotes`
        },
        confidence: 0.7,
      });
    } else if (doubleQuotes > singleQuotes * 1.5) {
      observations.push({
        domain: 'coding_style',
        category: 'quote_style',
        value: 'double',
        evidence: {
          file: filePath,
          pattern: `${doubleQuotes} double vs ${singleQuotes} single quotes`
        },
        confidence: 0.7,
      });
    }

    // Type hints usage
    const hasTypeHints = /def \w+\([^)]*:/.test(content) || /-> \w+:/.test(content);
    if (hasTypeHints) {
      observations.push({
        domain: 'coding_style',
        category: 'type_hints',
        value: 'always',
        evidence: { file: filePath, pattern: 'Type hints present' },
        confidence: 0.8,
      });
    }

    // Test framework detection
    if (content.includes('import pytest') || content.includes('from pytest')) {
      observations.push({
        domain: 'tool_choice',
        category: 'test_framework',
        value: 'pytest',
        evidence: { file: filePath, pattern: 'pytest imports' },
        confidence: 0.95,
      });
    } else if (content.includes('import unittest') || content.includes('from unittest')) {
      observations.push({
        domain: 'tool_choice',
        category: 'test_framework',
        value: 'unittest',
        evidence: { file: filePath, pattern: 'unittest imports' },
        confidence: 0.95,
      });
    }

    return observations;
  }

  /**
   * Analyze JavaScript/TypeScript code for preferences
   */
  analyzeJavaScriptCode(filePath, content) {
    const observations = [];

    // Indentation
    const has2Spaces = /^ {2}/m.test(content);
    const has4Spaces = /^ {4}/m.test(content);
    const hasTabs = /^\t/m.test(content);

    if (has2Spaces && !hasTabs && !has4Spaces) {
      observations.push({
        domain: 'coding_style',
        category: 'indentation',
        value: '2_spaces',
        evidence: { file: filePath, pattern: '2-space indentation' },
        confidence: 0.9,
      });
    } else if (has4Spaces && !hasTabs) {
      observations.push({
        domain: 'coding_style',
        category: 'indentation',
        value: '4_spaces',
        evidence: { file: filePath, pattern: '4-space indentation' },
        confidence: 0.9,
      });
    }

    // Quote style
    const singleQuotes = (content.match(/'/g) || []).length;
    const doubleQuotes = (content.match(/"/g) || []).length;

    if (singleQuotes > doubleQuotes * 1.5) {
      observations.push({
        domain: 'coding_style',
        category: 'quote_style',
        value: 'single',
        evidence: {
          file: filePath,
          pattern: `${singleQuotes} single vs ${doubleQuotes} double quotes`
        },
        confidence: 0.7,
      });
    } else if (doubleQuotes > singleQuotes * 1.5) {
      observations.push({
        domain: 'coding_style',
        category: 'quote_style',
        value: 'double',
        evidence: {
          file: filePath,
          pattern: `${doubleQuotes} double vs ${singleQuotes} single quotes`
        },
        confidence: 0.7,
      });
    }

    // Semicolon usage
    const hasSemicolons = /;$/m.test(content);
    if (hasSemicolons) {
      observations.push({
        domain: 'coding_style',
        category: 'semicolons',
        value: true,
        evidence: { file: filePath, pattern: 'Semicolons used' },
        confidence: 0.8,
      });
    }

    // Test framework detection
    if (content.includes('from \'jest\'') || content.includes('describe(')) {
      observations.push({
        domain: 'tool_choice',
        category: 'test_framework',
        value: 'jest',
        evidence: { file: filePath, pattern: 'Jest test framework' },
        confidence: 0.9,
      });
    } else if (content.includes('from \'vitest\'')) {
      observations.push({
        domain: 'tool_choice',
        category: 'test_framework',
        value: 'vitest',
        evidence: { file: filePath, pattern: 'Vitest test framework' },
        confidence: 0.9,
      });
    }

    return observations;
  }

  /**
   * Analyze config files for tool preferences
   */
  analyzeConfigFile(filePath, content) {
    const observations = [];
    const basename = path.basename(filePath);

    try {
      const config = JSON.parse(content);

      // package.json analysis
      if (basename === 'package.json') {
        // Package manager lock file presence
        if (config.packageManager) {
          const pm = config.packageManager.split('@')[0];
          observations.push({
            domain: 'tool_choice',
            category: 'package_manager',
            value: pm,
            evidence: { file: filePath, field: 'packageManager' },
            confidence: 1.0,
          });
        }

        // Test framework from scripts or dependencies
        if (config.scripts?.test?.includes('jest')) {
          observations.push({
            domain: 'tool_choice',
            category: 'test_framework',
            value: 'jest',
            evidence: { file: filePath, field: 'scripts.test' },
            confidence: 0.95,
          });
        } else if (config.scripts?.test?.includes('vitest')) {
          observations.push({
            domain: 'tool_choice',
            category: 'test_framework',
            value: 'vitest',
            evidence: { file: filePath, field: 'scripts.test' },
            confidence: 0.95,
          });
        }

        // Formatter preference
        if (config.devDependencies?.prettier || config.dependencies?.prettier) {
          observations.push({
            domain: 'tool_choice',
            category: 'formatter',
            value: 'prettier',
            evidence: { file: filePath, field: 'dependencies' },
            confidence: 0.9,
          });
        }
      }

      // tsconfig.json analysis
      if (basename === 'tsconfig.json') {
        if (config.compilerOptions?.strict === true) {
          observations.push({
            domain: 'coding_style',
            category: 'typescript_strict',
            value: true,
            evidence: { file: filePath, field: 'compilerOptions.strict' },
            confidence: 1.0,
          });
        }
      }
    } catch (error) {
      // Not valid JSON, skip
    }

    return observations;
  }

  /**
   * Generate preference guidance for agent prompt
   */
  async generatePreferenceGuidance() {
    const allPreferences = await this.getAllPreferences();

    if (allPreferences.length === 0) {
      return '';
    }

    // Group by domain
    const byDomain = {};
    for (const pref of allPreferences) {
      if (!byDomain[pref.domain]) {
        byDomain[pref.domain] = [];
      }
      byDomain[pref.domain].push(pref);
    }

    let guidance = '\n## 🎯 User Preferences\n\n';
    guidance += 'Apply these preferences when generating code:\n\n';

    for (const [domain, prefs] of Object.entries(byDomain)) {
      guidance += `**${domain.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}**:\n`;

      for (const pref of prefs) {
        const valueStr = typeof pref.value === 'object'
          ? JSON.stringify(pref.value)
          : String(pref.value);

        guidance += `- ${pref.category.replace(/_/g, ' ')}: ${valueStr}`;

        if (pref.confidence < 1.0) {
          guidance += ` (confidence: ${Math.round(pref.confidence * 100)}%)`;
        }

        guidance += '\n';
      }

      guidance += '\n';
    }

    return guidance;
  }

  // ============ Helper Methods ============

  /**
   * Load preferences from file into cache
   */
  async loadCache() {
    if (this.cacheLoaded) return;

    try {
      const content = await fs.readFile(this.preferenceFile, 'utf8');
      const lines = content.trim().split('\n');

      this.preferenceCache.clear();

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const pref = JSON.parse(line);
          const key = `${pref.domain}:${pref.category}`;
          this.preferenceCache.set(key, pref);
        } catch (error) {
          console.warn('[UserPreferences] Skipping invalid line:', line);
        }
      }

      this.cacheLoaded = true;
      console.log(`[UserPreferences] Loaded ${this.preferenceCache.size} preferences from cache`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[UserPreferences] Failed to load cache:', error);
      }
      this.cacheLoaded = true; // Mark as loaded even if file doesn't exist yet
    }
  }

  /**
   * Append a preference to the JSONL file
   */
  async appendPreference(preference) {
    try {
      // Ensure directory exists
      await fs.mkdir(this.preferencesDir, { recursive: true });

      await fs.appendFile(
        this.preferenceFile,
        JSON.stringify(preference) + '\n',
        'utf8'
      );
    } catch (error) {
      console.error('[UserPreferences] Failed to append preference:', error);
      throw error;
    }
  }

  /**
   * Update a preference in the JSONL file
   */
  async updatePreferenceInFile(updatedPreference) {
    try {
      const content = await fs.readFile(this.preferenceFile, 'utf8');
      const lines = content.trim().split('\n');

      const updatedLines = lines.map(line => {
        if (!line.trim()) return line;

        try {
          const pref = JSON.parse(line);
          if (pref.preference_id === updatedPreference.preference_id) {
            return JSON.stringify(updatedPreference);
          }
          return line;
        } catch (error) {
          return line;
        }
      });

      await fs.writeFile(this.preferenceFile, updatedLines.join('\n') + '\n', 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, just append
        await this.appendPreference(updatedPreference);
      } else {
        console.error('[UserPreferences] Failed to update preference:', error);
        throw error;
      }
    }
  }

  /**
   * Record an observation to the log
   */
  async recordObservation(observation) {
    try {
      // Ensure directory exists
      await fs.mkdir(this.preferencesDir, { recursive: true });

      await fs.appendFile(
        this.observationFile,
        JSON.stringify(observation) + '\n',
        'utf8'
      );
    } catch (error) {
      console.error('[UserPreferences] Failed to record observation:', error);
    }
  }
}

/**
 * Create user preference system instance
 */
export function createUserPreferenceSystem(preferencesDir, userId = 'default_user') {
  return new UserPreferenceSystem(preferencesDir, userId);
}
