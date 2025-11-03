/**
 * Task Graph Builder - Multi-Step Lookahead Planning
 *
 * [Phase 7.1] Build task graphs showing possible multi-step paths
 *
 * Purpose:
 *   Instead of evaluating only the next action, build a graph of
 *   possible 2-3 step sequences and evaluate entire paths.
 *
 * Key Features:
 *   - Build multi-level tree of alternatives
 *   - Detect dependencies between steps
 *   - Prune infeasible paths early
 *   - Extract all complete paths for evaluation
 *
 * @module frontend/core/agent/task-graph-builder
 */

import { ulid } from 'ulid';

/**
 * Create a task graph builder instance
 *
 * @param {Object} alternativeGenerator - Alternative generator from Phase 6.1
 * @param {Object} config - Configuration options
 * @returns {Object} Task graph builder instance
 */
export function createTaskGraphBuilder(alternativeGenerator, config = {}) {
  const maxDepth = config.maxDepth || 2;              // Look ahead 2 steps (3 = too slow)
  const maxBranchesPerLevel = config.maxBranches || 2; // Keep top 2 alternatives per level
  const maxTotalPaths = config.maxPaths || 10;         // Limit total paths to evaluate
  const pruneThreshold = config.pruneThreshold || {
    minConfidence: 0.3,   // Prune alternatives with confidence < 0.3
    maxComplexity: 8.0,   // Prune paths with total complexity > 8.0
  };

  /**
   * Build multi-step task graph
   *
   * @param {string} task - Current task description
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Task graph with nodes, edges, and paths
   */
  async function buildGraph(task, context) {
    const graphId = ulid();
    const startTime = Date.now();

    console.log(`[TaskGraphBuilder] ${graphId}: Building graph for: "${task}"`);
    console.log(`[TaskGraphBuilder] ${graphId}: Max depth=${maxDepth}, branches=${maxBranchesPerLevel}`);

    // Build root node (current state)
    const root = {
      id: 'root',
      task,
      depth: 0,
      alternatives: [],
      children: [],
    };

    // Build tree recursively
    await buildTreeRecursive(root, task, context, 0);

    // Extract all complete paths
    const paths = extractPaths(root);

    // Prune paths that exceed limits
    const prunedPaths = prunePaths(paths, maxTotalPaths);

    const elapsedMs = Date.now() - startTime;

    console.log(`[TaskGraphBuilder] ${graphId}: Built graph with ${paths.length} paths (pruned to ${prunedPaths.length})`);
    console.log(`[TaskGraphBuilder] ${graphId}: Completed in ${elapsedMs}ms`);

    return {
      graphId,
      root,
      paths: prunedPaths,
      allPaths: paths,
      stats: {
        totalPaths: paths.length,
        prunedPaths: prunedPaths.length,
        maxDepth,
        elapsedMs,
      },
    };
  }

  /**
   * Build tree recursively by generating alternatives at each level
   */
  async function buildTreeRecursive(node, task, context, depth) {
    // Stop at max depth
    if (depth >= maxDepth) {
      return;
    }

    console.log(`[TaskGraphBuilder] Depth ${depth}: Generating alternatives for: "${task}"`);

    // Generate alternatives for this task
    let alternatives;
    try {
      const result = await alternativeGenerator.generateAlternatives(task, context);
      alternatives = result.alternatives || [];
    } catch (err) {
      console.warn(`[TaskGraphBuilder] Failed to generate alternatives at depth ${depth}:`, err.message);
      alternatives = [];
    }

    // Prune low-confidence alternatives
    const prunedAlternatives = alternatives.filter(alt => {
      if (alt.confidence < pruneThreshold.minConfidence) {
        console.log(`[TaskGraphBuilder] Pruned low-confidence alternative: "${alt.name}" (confidence=${alt.confidence.toFixed(2)})`);
        return false;
      }
      return true;
    });

    // Sort by confidence (highest first) and keep top N
    const sortedAlternatives = prunedAlternatives
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxBranchesPerLevel);

    console.log(`[TaskGraphBuilder] Depth ${depth}: Kept ${sortedAlternatives.length}/${alternatives.length} alternatives`);

    // Store alternatives in node
    node.alternatives = sortedAlternatives;

    // For each alternative, derive next task and recurse
    for (const alt of sortedAlternatives) {
      // Create child node
      const childNode = {
        id: ulid(),
        task: deriveNextTask(alt, task),
        depth: depth + 1,
        alternative: alt,
        alternatives: [],
        children: [],
        parent: node,
      };

      node.children.push(childNode);

      // Recursively build tree
      await buildTreeRecursive(childNode, childNode.task, context, depth + 1);
    }
  }

  /**
   * Derive next task from an alternative
   *
   * Strategy:
   *   - If alternative has multiple steps, next task is "complete remaining steps"
   *   - If alternative is single-step, next task is "verify success and continue"
   *   - Use expected outcome as hint for next task
   */
  function deriveNextTask(alternative, currentTask) {
    const steps = alternative.steps || [];

    // Single-step alternative: next task is to verify and continue
    if (steps.length === 1) {
      const expectedOutcome = steps[0].expectedOutcome || 'completed';
      return `Verify that ${expectedOutcome} and continue toward goal`;
    }

    // Multi-step alternative: next task is to complete remaining steps
    if (steps.length > 1) {
      return `Complete remaining steps for: ${alternative.name}`;
    }

    // Fallback: generic continuation
    return `Continue after: ${alternative.name}`;
  }

  /**
   * Extract all complete paths from root to leaves
   *
   * A path is a sequence of alternatives from root to a leaf node
   */
  function extractPaths(root) {
    const paths = [];

    function traverse(node, currentPath) {
      // If leaf node (no children), this is a complete path
      if (node.children.length === 0) {
        // Only include paths with at least one alternative
        if (currentPath.length > 0) {
          paths.push({
            id: ulid(),
            steps: [...currentPath],
            depth: currentPath.length,
          });
        }
        return;
      }

      // Recursively traverse children
      for (const child of node.children) {
        const nextPath = child.alternative
          ? [...currentPath, child.alternative]
          : currentPath;

        traverse(child, nextPath);
      }
    }

    traverse(root, []);

    return paths;
  }

  /**
   * Prune paths to keep only top N by length and confidence
   *
   * Pruning strategy:
   *   1. Prefer longer paths (more planning ahead)
   *   2. Among same-length paths, prefer higher average confidence
   */
  function prunePaths(paths, maxPaths) {
    if (paths.length <= maxPaths) {
      return paths;
    }

    // Calculate score for each path
    const scoredPaths = paths.map(path => {
      // Calculate average confidence
      const avgConfidence = path.steps.reduce((sum, step) => sum + step.confidence, 0) / path.steps.length;

      // Score: depth is primary, confidence is tiebreaker
      const score = path.depth * 10 + avgConfidence;

      return { path, score, avgConfidence };
    });

    // Sort by score (highest first)
    const sorted = scoredPaths.sort((a, b) => b.score - a.score);

    // Take top N
    const topPaths = sorted.slice(0, maxPaths).map(sp => sp.path);

    console.log(`[TaskGraphBuilder] Pruned ${paths.length - topPaths.length} paths (kept top ${maxPaths})`);

    return topPaths;
  }

  return {
    buildGraph,
  };
}
