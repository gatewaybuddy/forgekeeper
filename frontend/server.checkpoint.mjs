/**
 * Decision Checkpoint System (Phase 8.2: T304)
 *
 * Pauses execution at key decision points for user review and selection.
 *
 * Features:
 * - Multiple checkpoint types (plan, strategy, parameter, execution)
 * - Option presentation with pros/cons
 * - Confidence-based triggering
 * - Decision capture and storage
 * - ContextLog integration
 *
 * @module server.checkpoint
 */

import { ulid } from 'ulid';
import { appendEvent } from './server.contextlog.mjs';

/**
 * @typedef {'plan' | 'strategy' | 'parameter' | 'execution'} CheckpointType
 */

/**
 * @typedef {'low' | 'medium' | 'high'} RiskLevel
 */

/**
 * @typedef {Object} DecisionOption
 * @property {string} id - Unique option ID
 * @property {string} label - Short label for the option
 * @property {string} description - Detailed description
 * @property {string[]} pros - List of advantages
 * @property {string[]} cons - List of disadvantages
 * @property {RiskLevel} riskLevel - Risk assessment
 * @property {string} [estimatedEffort] - Estimated effort (e.g., "2 hours")
 * @property {number} [confidence] - Confidence score (0.0-1.0)
 */

/**
 * @typedef {Object} DecisionCheckpoint
 * @property {string} id - Unique checkpoint ID (ULID)
 * @property {CheckpointType} type - Type of checkpoint
 * @property {string} title - Checkpoint title
 * @property {string} description - Detailed description
 * @property {DecisionOption[]} options - Available options
 * @property {string} recommendation - Recommended option ID
 * @property {number} confidence - Confidence in recommendation (0.0-1.0)
 * @property {string} status - 'waiting' | 'resolved'
 * @property {string} [selectedOption] - ID of selected option
 * @property {string} [reasoning] - User's reasoning for selection
 * @property {string} timestamp - ISO timestamp
 * @property {string} [convId] - Conversation ID
 * @property {string} [traceId] - Trace ID
 */

/**
 * In-memory checkpoint queue
 * @type {Map<string, DecisionCheckpoint>}
 */
const checkpointQueue = new Map();

/**
 * Pending promises waiting for checkpoint resolution
 * @type {Map<string, {resolve: Function, reject: Function}>}
 */
const pendingResolutions = new Map();

/**
 * Configuration from environment
 */
function getConfig() {
  return {
    enabled: process.env.AUTONOMOUS_ENABLE_CHECKPOINTS === '1',
    confidenceThreshold: parseFloat(process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD || '0.7'),
    minOptions: parseInt(process.env.AUTONOMOUS_MIN_CHECKPOINT_OPTIONS || '2', 10),
    maxOptions: parseInt(process.env.AUTONOMOUS_MAX_CHECKPOINT_OPTIONS || '5', 10),
  };
}

/**
 * Determine if a checkpoint should be triggered based on confidence
 *
 * @param {number} confidence - Confidence score (0.0-1.0)
 * @param {CheckpointType} type - Type of checkpoint
 * @returns {boolean} True if checkpoint should be triggered
 */
export function shouldTriggerCheckpoint(confidence, type) {
  const config = getConfig();

  if (!config.enabled) {
    return false;
  }

  // Always trigger for execution checkpoints (critical decisions)
  if (type === 'execution') {
    return confidence < 0.9; // High bar for execution
  }

  // Trigger if confidence is below threshold
  return confidence < config.confidenceThreshold;
}

/**
 * Create a new decision checkpoint
 *
 * @param {CheckpointType} type - Type of checkpoint
 * @param {string} title - Checkpoint title
 * @param {string} description - Detailed description
 * @param {DecisionOption[]} options - Available options (2-5)
 * @param {string} recommendation - Recommended option ID
 * @param {number} confidence - Confidence in recommendation (0.0-1.0)
 * @param {Object} [metadata] - Optional metadata
 * @param {string} [metadata.convId] - Conversation ID
 * @param {string} [metadata.traceId] - Trace ID
 * @returns {Promise<DecisionOption>} Promise that resolves with selected option
 */
export async function createCheckpoint(
  type,
  title,
  description,
  options,
  recommendation,
  confidence,
  metadata = {}
) {
  const config = getConfig();

  // Validation
  if (!config.enabled) {
    // If checkpoints disabled, auto-select recommendation
    const recommendedOption = options.find((opt) => opt.id === recommendation);
    return recommendedOption || options[0];
  }

  if (options.length < 2) {
    throw new Error('Checkpoint must have at least 2 options');
  }

  if (options.length > config.maxOptions) {
    throw new Error(`Checkpoint cannot have more than ${config.maxOptions} options`);
  }

  if (!options.find((opt) => opt.id === recommendation)) {
    throw new Error('Recommendation must be one of the provided options');
  }

  const checkpointId = ulid();
  const timestamp = new Date().toISOString();

  /** @type {DecisionCheckpoint} */
  const checkpoint = {
    id: checkpointId,
    type,
    title,
    description,
    options,
    recommendation,
    confidence,
    status: 'waiting',
    timestamp,
    convId: metadata.convId,
    traceId: metadata.traceId,
  };

  // Add to queue
  checkpointQueue.set(checkpointId, checkpoint);

  // Log checkpoint event
  appendEvent({
    actor: 'autonomous',
    act: 'checkpoint_created',
    conv_id: metadata.convId,
    trace_id: metadata.traceId,
    checkpoint_id: checkpointId,
    checkpoint_type: type,
    options_count: options.length,
    recommendation,
    confidence,
    title,
  });

  // Create promise that will be resolved when user makes decision
  return new Promise((resolve, reject) => {
    pendingResolutions.set(checkpointId, { resolve, reject });
  });
}

/**
 * Resolve a checkpoint with user's decision
 *
 * @param {string} checkpointId - Checkpoint ID
 * @param {string} selectedOptionId - Selected option ID
 * @param {string} [reasoning] - User's reasoning
 * @returns {boolean} True if checkpoint was resolved successfully
 */
export function resolveCheckpoint(checkpointId, selectedOptionId, reasoning) {
  const checkpoint = checkpointQueue.get(checkpointId);

  if (!checkpoint) {
    console.error(`[Checkpoint] Checkpoint ${checkpointId} not found`);
    return false;
  }

  if (checkpoint.status !== 'waiting') {
    console.error(`[Checkpoint] Checkpoint ${checkpointId} already resolved`);
    return false;
  }

  const selectedOption = checkpoint.options.find((opt) => opt.id === selectedOptionId);

  if (!selectedOption) {
    console.error(`[Checkpoint] Option ${selectedOptionId} not found in checkpoint ${checkpointId}`);
    return false;
  }

  const pending = pendingResolutions.get(checkpointId);

  if (!pending) {
    console.error(`[Checkpoint] No pending resolution for checkpoint ${checkpointId}`);
    return false;
  }

  // Update checkpoint
  checkpoint.status = 'resolved';
  checkpoint.selectedOption = selectedOptionId;
  checkpoint.reasoning = reasoning;

  // Log resolution event
  const elapsedMs = Date.now() - new Date(checkpoint.timestamp).getTime();
  const wasRecommended = selectedOptionId === checkpoint.recommendation;

  appendEvent({
    actor: 'user',
    act: 'checkpoint_resolved',
    conv_id: checkpoint.convId,
    trace_id: checkpoint.traceId,
    checkpoint_id: checkpointId,
    checkpoint_type: checkpoint.type,
    selected_option: selectedOptionId,
    recommendation: checkpoint.recommendation,
    matched_recommendation: wasRecommended,
    reasoning,
    elapsed_ms: elapsedMs,
  });

  // Resolve the promise with selected option
  pending.resolve(selectedOption);
  pendingResolutions.delete(checkpointId);

  return true;
}

/**
 * Get all waiting checkpoints
 *
 * @param {Object} [options] - Filter options
 * @param {string} [options.convId] - Filter by conversation ID
 * @param {CheckpointType} [options.type] - Filter by type
 * @returns {DecisionCheckpoint[]} Array of waiting checkpoints
 */
export function getWaitingCheckpoints(options = {}) {
  let checkpoints = Array.from(checkpointQueue.values()).filter(
    (cp) => cp.status === 'waiting'
  );

  if (options.convId) {
    checkpoints = checkpoints.filter((cp) => cp.convId === options.convId);
  }

  if (options.type) {
    checkpoints = checkpoints.filter((cp) => cp.type === options.type);
  }

  return checkpoints;
}

/**
 * Get a specific checkpoint by ID
 *
 * @param {string} checkpointId - Checkpoint ID
 * @returns {DecisionCheckpoint | undefined} The checkpoint, or undefined if not found
 */
export function getCheckpoint(checkpointId) {
  return checkpointQueue.get(checkpointId);
}

/**
 * Cancel a waiting checkpoint (auto-select recommendation)
 *
 * @param {string} checkpointId - Checkpoint ID
 * @returns {boolean} True if cancelled successfully
 */
export function cancelCheckpoint(checkpointId) {
  const checkpoint = checkpointQueue.get(checkpointId);

  if (!checkpoint || checkpoint.status !== 'waiting') {
    return false;
  }

  const pending = pendingResolutions.get(checkpointId);

  if (!pending) {
    return false;
  }

  // Auto-select recommendation
  const recommendedOption = checkpoint.options.find((opt) => opt.id === checkpoint.recommendation);

  checkpoint.status = 'resolved';
  checkpoint.selectedOption = checkpoint.recommendation;
  checkpoint.reasoning = 'Auto-selected (checkpoint cancelled)';

  // Log cancellation
  appendEvent({
    actor: 'system',
    act: 'checkpoint_cancelled',
    conv_id: checkpoint.convId,
    trace_id: checkpoint.traceId,
    checkpoint_id: checkpointId,
    auto_selected: checkpoint.recommendation,
  });

  // Resolve with recommendation
  pending.resolve(recommendedOption);
  pendingResolutions.delete(checkpointId);

  return true;
}

/**
 * Clear old resolved checkpoints from queue
 *
 * @param {number} [maxAgeMs=3600000] - Max age in milliseconds (default 1 hour)
 * @returns {number} Number of checkpoints cleared
 */
export function cleanupOldCheckpoints(maxAgeMs = 3600000) {
  const now = Date.now();
  let cleared = 0;

  for (const [id, checkpoint] of checkpointQueue.entries()) {
    const age = now - new Date(checkpoint.timestamp).getTime();

    if (checkpoint.status === 'resolved' && age > maxAgeMs) {
      checkpointQueue.delete(id);
      cleared++;
    }
  }

  return cleared;
}

/**
 * Get checkpoint system statistics
 *
 * @returns {Object} Statistics
 */
export function getCheckpointStats() {
  const config = getConfig();
  const checkpoints = Array.from(checkpointQueue.values());

  // Calculate recommendation acceptance rate
  const resolved = checkpoints.filter((cp) => cp.status === 'resolved');
  const matchedRecommendation = resolved.filter(
    (cp) => cp.selectedOption === cp.recommendation
  ).length;
  const acceptanceRate =
    resolved.length > 0 ? (matchedRecommendation / resolved.length) * 100 : 0;

  // Group by type
  const byType = {
    plan: checkpoints.filter((cp) => cp.type === 'plan').length,
    strategy: checkpoints.filter((cp) => cp.type === 'strategy').length,
    parameter: checkpoints.filter((cp) => cp.type === 'parameter').length,
    execution: checkpoints.filter((cp) => cp.type === 'execution').length,
  };

  return {
    enabled: config.enabled,
    confidenceThreshold: config.confidenceThreshold,
    total: checkpoints.length,
    waiting: checkpoints.filter((cp) => cp.status === 'waiting').length,
    resolved: resolved.length,
    recommendationAcceptanceRate: parseFloat(acceptanceRate.toFixed(1)),
    byType,
  };
}

/**
 * Helper: Create a multi-strategy checkpoint
 * Common pattern for choosing between different approaches
 *
 * @param {string} task - Task description
 * @param {Array<{label: string, description: string, pros: string[], cons: string[], risk: RiskLevel, effort?: string}>} strategies - Strategy options
 * @param {number} recommendedIndex - Index of recommended strategy
 * @param {number} confidence - Confidence in recommendation
 * @param {Object} [metadata] - Optional metadata
 * @returns {Promise<DecisionOption>} Selected strategy
 */
export async function createStrategyCheckpoint(
  task,
  strategies,
  recommendedIndex,
  confidence,
  metadata = {}
) {
  const options = strategies.map((strategy, idx) => ({
    id: `strategy-${idx}`,
    label: strategy.label,
    description: strategy.description,
    pros: strategy.pros,
    cons: strategy.cons,
    riskLevel: strategy.risk,
    estimatedEffort: strategy.effort,
  }));

  return createCheckpoint(
    'strategy',
    `Choose Strategy: ${task}`,
    `Multiple valid approaches exist for this task. Select the preferred strategy.`,
    options,
    `strategy-${recommendedIndex}`,
    confidence,
    metadata
  );
}

// Periodic cleanup (run every 10 minutes)
setInterval(() => {
  const cleared = cleanupOldCheckpoints();
  if (cleared > 0) {
    console.log(`[Checkpoint] Cleaned up ${cleared} old checkpoints`);
  }
}, 600000);
