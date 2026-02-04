/**
 * Scout Performance Metrics Tracking
 *
 * Tracks Scout agent's effectiveness at empirical discovery
 */

import fs from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';

const METRICS_DIR = '.forgekeeper/scout_metrics';
const METRICS_FILE = path.join(METRICS_DIR, 'scout-performance.jsonl');

// In-memory metrics for current session
let sessionMetrics = {
  sessionId: null,
  startTime: null,

  // Primary Metrics
  tasksProcessed: 0,
  challengesIssued: 0,
  attemptsCatalyzed: 0,
  boundariesDiscovered: 0,
  falseLimitationsOverturned: 0,

  // Secondary Metrics
  theoreticalBlocksPrevented: 0,
  groupthinkChallenges: 0,
  unanimousAgreements: 0,

  // Response Quality
  challengeQualityScores: [],

  // Timing
  timeToFirstAttempt: [],
  challengeResponseTimes: [],

  // Events
  events: []
};

/**
 * Initialize a new Scout metrics session
 */
export async function initScoutMetrics() {
  // Ensure metrics directory exists
  await fs.mkdir(METRICS_DIR, { recursive: true });

  sessionMetrics = {
    sessionId: ulid(),
    startTime: Date.now(),
    tasksProcessed: 0,
    challengesIssued: 0,
    attemptsCatalyzed: 0,
    boundariesDiscovered: 0,
    falseLimitationsOverturned: 0,
    theoreticalBlocksPrevented: 0,
    groupthinkChallenges: 0,
    unanimousAgreements: 0,
    challengeQualityScores: [],
    timeToFirstAttempt: [],
    challengeResponseTimes: [],
    events: []
  };

  return sessionMetrics.sessionId;
}

/**
 * Record a Scout challenge event
 */
export function recordChallenge(data) {
  const event = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: 'challenge',
    sessionId: sessionMetrics.sessionId,
    ...data
  };

  sessionMetrics.challengesIssued++;
  sessionMetrics.events.push(event);

  // Calculate challenge quality score
  let qualityScore = 0;
  if (data.specific_action) qualityScore += 2; // Specific
  if (data.challenge) qualityScore += 1;       // Actionable

  sessionMetrics.challengeQualityScores.push(qualityScore);

  return event;
}

/**
 * Record that a challenge led to an actual attempt
 */
export function recordAttemptCatalyzed(data) {
  const event = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: 'attempt_catalyzed',
    sessionId: sessionMetrics.sessionId,
    ...data
  };

  sessionMetrics.attemptsCatalyzed++;
  sessionMetrics.events.push(event);

  if (data.timeToAttempt) {
    sessionMetrics.timeToFirstAttempt.push(data.timeToAttempt);
  }

  return event;
}

/**
 * Record an empirical boundary discovered
 */
export function recordBoundaryDiscovered(data) {
  const event = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: 'boundary_discovered',
    sessionId: sessionMetrics.sessionId,
    boundaryType: data.boundaryType || 'empirical', // 'empirical' or 'theoretical'
    ...data
  };

  if (data.boundaryType === 'empirical') {
    sessionMetrics.boundariesDiscovered++;
  }

  sessionMetrics.events.push(event);

  return event;
}

/**
 * Record a false limitation that was overturned
 */
export function recordFalseLimitation(data) {
  const event = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: 'false_limitation_overturned',
    sessionId: sessionMetrics.sessionId,
    ...data
  };

  sessionMetrics.falseLimitationsOverturned++;
  sessionMetrics.events.push(event);

  return event;
}

/**
 * Record Scout approval (passed without challenge)
 */
export function recordScoutApproval(data) {
  const event = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: 'scout_approved',
    sessionId: sessionMetrics.sessionId,
    ...data
  };

  sessionMetrics.events.push(event);

  return event;
}

/**
 * Record task completion
 */
export function recordTaskComplete(data) {
  const event = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: 'task_complete',
    sessionId: sessionMetrics.sessionId,
    ...data
  };

  sessionMetrics.tasksProcessed++;
  sessionMetrics.events.push(event);

  return event;
}

/**
 * Record human intervention (Phase 3)
 *
 * @param {object} data - {question, response, action, iteration}
 */
export function recordHumanIntervention(data) {
  const event = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    type: 'human_intervention',
    sessionId: sessionMetrics.sessionId,
    ...data
  };

  sessionMetrics.events.push(event);
  console.log('[Scout Metrics] Human intervention recorded:', data.action);

  return event;
}

/**
 * Calculate current session metrics
 */
export function calculateMetrics() {
  const {
    tasksProcessed,
    challengesIssued,
    attemptsCatalyzed,
    boundariesDiscovered,
    falseLimitationsOverturned,
    theoreticalBlocksPrevented,
    groupthinkChallenges,
    unanimousAgreements,
    challengeQualityScores,
    timeToFirstAttempt
  } = sessionMetrics;

  // Discovery Rate: (empirical_boundaries + capabilities_proven) / total_tasks
  const discoveryRate = tasksProcessed > 0
    ? (boundariesDiscovered + falseLimitationsOverturned) / tasksProcessed
    : 0;

  // Attempt Catalyst Score: attempts_after_challenge / challenges_issued
  const catalystScore = challengesIssued > 0
    ? attemptsCatalyzed / challengesIssued
    : 0;

  // False Limitation Rate: assumptions_overturned / total_limitations_claimed
  const falseLimitationRate = challengesIssued > 0
    ? falseLimitationsOverturned / challengesIssued
    : 0;

  // Groupthink Prevention: unanimous_agreements_challenged / unanimous_agreements_total
  const groupthinkPrevention = unanimousAgreements > 0
    ? groupthinkChallenges / unanimousAgreements
    : 0;

  // Average challenge quality
  const avgChallengeQuality = challengeQualityScores.length > 0
    ? challengeQualityScores.reduce((a, b) => a + b, 0) / challengeQualityScores.length
    : 0;

  // Average time to first attempt (in seconds)
  const avgTimeToAttempt = timeToFirstAttempt.length > 0
    ? timeToFirstAttempt.reduce((a, b) => a + b, 0) / timeToFirstAttempt.length / 1000
    : 0;

  return {
    // Session info
    sessionId: sessionMetrics.sessionId,
    startTime: sessionMetrics.startTime,
    duration: Date.now() - sessionMetrics.startTime,

    // Counts
    tasksProcessed,
    challengesIssued,
    attemptsCatalyzed,
    boundariesDiscovered,
    falseLimitationsOverturned,
    theoreticalBlocksPrevented,

    // Primary Metrics
    discoveryRate,
    catalystScore,
    falseLimitationRate,
    groupthinkPrevention,

    // Secondary Metrics
    avgChallengeQuality,
    avgTimeToAttempt,

    // Goals
    goals: {
      discoveryRate: { current: discoveryRate, target: 0.8, met: discoveryRate >= 0.8 },
      catalystScore: { current: catalystScore, target: 0.9, met: catalystScore >= 0.9 },
      avgChallengeQuality: { current: avgChallengeQuality, target: 1.5, met: avgChallengeQuality >= 1.5 }
    }
  };
}

/**
 * Get current session metrics
 */
export function getSessionMetrics() {
  return {
    ...sessionMetrics,
    calculated: calculateMetrics()
  };
}

/**
 * Persist session metrics to JSONL file
 */
export async function persistMetrics() {
  const metrics = calculateMetrics();
  const record = {
    ...metrics,
    timestamp: new Date().toISOString(),
    events: sessionMetrics.events
  };

  try {
    await fs.appendFile(
      METRICS_FILE,
      JSON.stringify(record) + '\n',
      'utf8'
    );
  } catch (error) {
    console.error('[Scout Metrics] Failed to persist metrics:', error);
  }
}

/**
 * Get historical metrics (last N sessions)
 */
export async function getHistoricalMetrics(limit = 10) {
  try {
    const content = await fs.readFile(METRICS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    const sessions = lines
      .slice(-limit)
      .map(line => JSON.parse(line));

    return sessions;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Generate Scout performance report
 */
export function generateReport() {
  const metrics = calculateMetrics();

  const report = `
# Scout Performance Report

## Current Session
- Session ID: ${metrics.sessionId}
- Duration: ${Math.round(metrics.duration / 1000 / 60)} minutes
- Tasks Processed: ${metrics.tasksProcessed}
- Challenges Issued: ${metrics.challengesIssued}
- Attempts Catalyzed: ${metrics.attemptsCatalyzed} (${(metrics.catalystScore * 100).toFixed(1)}%)
- Boundaries Discovered: ${metrics.boundariesDiscovered}
- False Limitations Overturned: ${metrics.falseLimitationsOverturned}

## Learning Velocity
- Discovery Rate: ${(metrics.discoveryRate).toFixed(2)} ${metrics.goals.discoveryRate.met ? '✅' : '⏳'} (target: 0.80)
- Catalyst Score: ${(metrics.catalystScore).toFixed(2)} ${metrics.goals.catalystScore.met ? '✅' : '⏳'} (target: 0.90)
- Challenge Effectiveness: ${(metrics.avgChallengeQuality).toFixed(2)} ${metrics.goals.avgChallengeQuality.met ? '✅' : '⏳'} (target: 1.50)

## System Impact
- Time to First Attempt: ${metrics.avgTimeToAttempt.toFixed(1)} seconds
- Theoretical Blocks Prevented: ${metrics.theoreticalBlocksPrevented}

## Calibration Status
${getCalibrationStatus(metrics)}
`;

  return report.trim();
}

/**
 * Get calibration status and recommendations
 */
function getCalibrationStatus(metrics) {
  const issues = [];

  // Too aggressive
  if (metrics.catalystScore > 0.95 && metrics.challengesIssued > 5) {
    issues.push('⚠️  Scout may be TOO AGGRESSIVE');
    issues.push('   - Catalyst score > 0.95');
    issues.push('   - Consider increasing evidence acceptance threshold');
  }

  // Too passive
  if (metrics.catalystScore < 0.7 && metrics.challengesIssued > 0) {
    issues.push('⚠️  Scout may be TOO PASSIVE');
    issues.push('   - Catalyst score < 0.7');
    issues.push('   - Consider decreasing challenge threshold');
  }

  if (metrics.falseLimitationRate > 0.3) {
    issues.push('⚠️  High false limitation rate');
    issues.push('   - Many limitations claimed without testing');
    issues.push('   - Scout is correctly challenging assumptions');
  }

  if (issues.length === 0) {
    return '✅ Scout is well-calibrated';
  }

  return issues.join('\n');
}

/**
 * Reset session metrics (for testing)
 */
export function resetMetrics() {
  return initScoutMetrics();
}
