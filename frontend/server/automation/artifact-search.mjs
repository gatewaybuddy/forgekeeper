/**
 * Artifact Search & Retrieval
 *
 * Unified search interface across all artifact types.
 * Provides fast lookup of session summaries, learnings, decisions, and patterns.
 *
 * @module server/automation/artifact-search
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Search all artifacts by query
 *
 * @param {Object} query - Search query
 * @param {string} [query.text] - Text search (title, description, task)
 * @param {Array<string>} [query.types] - Artifact types to search (session, learning, decision, pattern)
 * @param {string} [query.sessionId] - Filter by session ID
 * @param {string} [query.taskType] - Filter by task type
 * @param {number} [query.minConfidence] - Minimum confidence filter
 * @param {string} [query.dateFrom] - Start date (YYYY-MM-DD)
 * @param {string} [query.dateTo] - End date (YYYY-MM-DD)
 * @param {number} [query.limit] - Max results (default: 50)
 * @param {Object} [options] - Search options
 * @param {string} [options.artifactsRoot] - Artifacts directory root
 * @returns {Promise<Array<Object>>} Matching artifacts
 */
export async function searchArtifacts(query, options = {}) {
  const artifactsRoot = options.artifactsRoot || '.forgekeeper/artifacts';
  const types = query.types || ['session', 'learning', 'decision', 'pattern'];
  const results = [];

  // Search each artifact type
  for (const type of types) {
    const typeResults = await searchByType(type, query, artifactsRoot);
    results.push(...typeResults);
  }

  // Apply text search if provided
  let filtered = results;
  if (query.text) {
    const searchText = query.text.toLowerCase();
    filtered = results.filter(artifact => {
      const searchable = `${artifact.title || ''} ${artifact.description || ''} ${artifact.task || ''}`.toLowerCase();
      return searchable.includes(searchText);
    });
  }

  // Sort by timestamp descending (newest first)
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply limit
  const limit = query.limit || 50;
  return filtered.slice(0, limit);
}

/**
 * Search artifacts by type
 *
 * @param {string} type - Artifact type
 * @param {Object} query - Search query
 * @param {string} artifactsRoot - Artifacts root directory
 * @returns {Promise<Array<Object>>} Matching artifacts
 */
async function searchByType(type, query, artifactsRoot) {
  const typeDir = path.join(artifactsRoot, `${type}s`);
  const results = [];

  try {
    // Get all subdirectories (dates or categories)
    const subdirs = await getSubdirectories(typeDir);

    for (const subdir of subdirs) {
      const subdirPath = path.join(typeDir, subdir);

      // Apply date filters
      if (query.dateFrom || query.dateTo) {
        if (!isDateInRange(subdir, query.dateFrom, query.dateTo)) {
          continue;
        }
      }

      // Get all JSON metadata files
      const files = await fs.readdir(subdirPath);
      const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('journal'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(subdirPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const metadata = JSON.parse(content);

          // Apply filters
          if (query.sessionId && metadata.sessionId !== query.sessionId) continue;
          if (query.taskType && metadata.taskType !== query.taskType) continue;
          if (query.minConfidence && (metadata.confidence || 0) < query.minConfidence) continue;

          // Add to results with type and paths
          results.push({
            ...metadata,
            type,
            metadataPath: filePath,
            markdownPath: filePath.replace('.json', '.md'),
          });
        } catch (err) {
          // Skip invalid JSON files
          continue;
        }
      }
    }
  } catch (err) {
    // Type directory might not exist
    return [];
  }

  return results;
}

/**
 * Get artifact by ID
 *
 * @param {string} artifactId - Artifact ID (ULID)
 * @param {Object} [options] - Options
 * @param {string} [options.artifactsRoot] - Artifacts root directory
 * @returns {Promise<Object|null>} Artifact metadata and content
 */
export async function getArtifact(artifactId, options = {}) {
  const artifactsRoot = options.artifactsRoot || '.forgekeeper/artifacts';
  const types = ['sessions', 'learnings', 'decisions', 'patterns'];

  for (const type of types) {
    const typeDir = path.join(artifactsRoot, type);

    try {
      const subdirs = await getSubdirectories(typeDir);

      for (const subdir of subdirs) {
        const subdirPath = path.join(typeDir, subdir);
        const files = await fs.readdir(subdirPath);

        // Find metadata file with matching artifact ID
        const metadataFile = files.find(f => f.includes(artifactId) && f.endsWith('.json'));

        if (metadataFile) {
          const metadataPath = path.join(subdirPath, metadataFile);
          const markdownPath = metadataPath.replace('.json', '.md');

          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          const markdown = await fs.readFile(markdownPath, 'utf-8');

          return {
            ...metadata,
            type: type.slice(0, -1), // Remove trailing 's'
            metadataPath,
            markdownPath,
            content: markdown,
          };
        }
      }
    } catch (err) {
      continue;
    }
  }

  return null;
}

/**
 * Get recent artifacts
 *
 * @param {Object} options - Options
 * @param {number} [options.limit] - Max results (default: 10)
 * @param {Array<string>} [options.types] - Artifact types to include
 * @param {string} [options.artifactsRoot] - Artifacts root directory
 * @returns {Promise<Array<Object>>} Recent artifacts
 */
export async function getRecentArtifacts(options = {}) {
  return await searchArtifacts({
    types: options.types,
    limit: options.limit || 10,
  }, {
    artifactsRoot: options.artifactsRoot,
  });
}

/**
 * Get artifact statistics
 *
 * @param {Object} [options] - Options
 * @param {string} [options.artifactsRoot] - Artifacts root directory
 * @returns {Promise<Object>} Statistics by type
 */
export async function getArtifactStats(options = {}) {
  const artifactsRoot = options.artifactsRoot || '.forgekeeper/artifacts';
  const types = ['sessions', 'learnings', 'decisions', 'patterns'];
  const stats = {
    total: 0,
    byType: {},
  };

  for (const type of types) {
    const typeDir = path.join(artifactsRoot, type);
    let count = 0;

    try {
      const subdirs = await getSubdirectories(typeDir);

      for (const subdir of subdirs) {
        const subdirPath = path.join(typeDir, subdir);
        const files = await fs.readdir(subdirPath);
        const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('journal'));
        count += jsonFiles.length;
      }
    } catch (err) {
      count = 0;
    }

    stats.byType[type] = count;
    stats.total += count;
  }

  return stats;
}

/**
 * Get related artifacts (by session ID or tags)
 *
 * @param {string} artifactId - Starting artifact ID
 * @param {Object} [options] - Options
 * @param {number} [options.limit] - Max related artifacts (default: 5)
 * @param {string} [options.artifactsRoot] - Artifacts root directory
 * @returns {Promise<Array<Object>>} Related artifacts
 */
export async function getRelatedArtifacts(artifactId, options = {}) {
  const artifact = await getArtifact(artifactId, options);
  if (!artifact) return [];

  const related = [];

  // Find artifacts from the same session
  if (artifact.sessionId) {
    const sessionArtifacts = await searchArtifacts({
      sessionId: artifact.sessionId,
      limit: options.limit || 5,
    }, {
      artifactsRoot: options.artifactsRoot,
    });

    related.push(...sessionArtifacts.filter(a => a.artifactId !== artifactId));
  }

  // Find artifacts with matching tags
  if (artifact.tags && artifact.tags.length > 0) {
    const tagResults = await searchArtifacts({
      types: ['learning'],
      limit: 10,
    }, {
      artifactsRoot: options.artifactsRoot,
    });

    const tagMatches = tagResults.filter(a =>
      a.artifactId !== artifactId &&
      a.tags &&
      a.tags.some(tag => artifact.tags.includes(tag))
    );

    related.push(...tagMatches);
  }

  // Remove duplicates and limit
  const unique = Array.from(new Map(related.map(a => [a.artifactId, a])).values());
  return unique.slice(0, options.limit || 5);
}

/**
 * Get subdirectories in a path
 *
 * @param {string} dirPath - Directory path
 * @returns {Promise<Array<string>>} Subdirectory names
 */
async function getSubdirectories(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (err) {
    return [];
  }
}

/**
 * Check if a date directory is within range
 *
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} [fromDate] - Start date
 * @param {string} [toDate] - End date
 * @returns {boolean} Whether date is in range
 */
function isDateInRange(dateStr, fromDate, toDate) {
  // Handle date formats (YYYY-MM-DD or category names)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // Not a date, it's a category - include it
    return true;
  }

  const date = new Date(dateStr);
  if (fromDate && date < new Date(fromDate)) return false;
  if (toDate && date > new Date(toDate)) return false;
  return true;
}
