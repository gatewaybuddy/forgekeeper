/**
 * Scout Monitor - Adversarial Self-Monitoring
 *
 * Implements the Scout concept from the original Forgekeeper design:
 * a dedicated adversarial process that runs in parallel with main
 * agent reasoning to detect issues.
 *
 * Watches for:
 * - Assumption drift
 * - Goal abandonment
 * - Value conflicts
 * - Groupthink patterns
 * - Confidence miscalibration
 *
 * Can inject "challenges" into the reasoning stream and logs
 * concerns to ContextLog with actor: 'scout'.
 */

import { ulid } from 'ulid';
import { detectIdentityIssues, GOAL_PRIORITIES } from './identity-state.mjs';

/**
 * @typedef {Object} AssumptionMetadata
 * @property {string} primary_optimization - What was optimized for
 * @property {string[]} assumed_constraints - What was treated as fixed
 * @property {string[]} tradeoffs_accepted - What was sacrificed
 * @property {'high'|'medium'|'low'} confidence - Confidence level
 * @property {string[]} would_reconsider_if - Conditions that would change answer
 */

/**
 * @typedef {Object} ScoutChallenge
 * @property {string} challenge_id - Unique identifier
 * @property {'assumption_drift'|'goal_abandonment'|'value_conflict'|'groupthink'|'confidence_issue'|'bias_detected'} type
 * @property {string} description - Human-readable description
 * @property {'low'|'medium'|'high'|'critical'} severity
 * @property {string} timestamp - ISO timestamp
 * @property {Object} context - Additional context data
 * @property {string[]} suggested_actions - Recommended responses
 * @property {boolean} acknowledged - Whether challenge was acknowledged
 */

/**
 * @typedef {Object} ScoutObservation
 * @property {string} observation_id - Unique identifier
 * @property {string} timestamp - ISO timestamp
 * @property {string} agent_id - Agent being monitored
 * @property {'action'|'decision'|'claim'|'goal_change'|'value_expression'} observation_type
 * @property {string} content - What was observed
 * @property {AssumptionMetadata|null} assumptions - Extracted assumptions if any
 * @property {number} concern_level - 0-1 level of concern
 */

/**
 * Scout Monitor
 *
 * Adversarial monitoring for agent reasoning and behavior.
 */
export class ScoutMonitor {
  /**
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      challengeThreshold: options.challengeThreshold ?? 0.7, // Confidence below this triggers challenge
      groupthinkWindow: options.groupthinkWindow ?? 10, // Number of decisions to track
      assumptionDriftThreshold: options.assumptionDriftThreshold ?? 3, // Consecutive similar assumptions
      logToContextLog: options.logToContextLog ?? true,
      contextLogger: options.contextLogger || null, // ContextLog instance
      ...options,
    };

    // In-memory state
    this.observations = [];
    this.challenges = [];
    this.decisionHistory = [];
    this.assumptionPatterns = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the scout monitor
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[ScoutMonitor] Initialized');
  }

  /**
   * Generate a unique ID
   */
  generateId(prefix) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${ts}-${rand}`;
  }

  /**
   * Record an observation about agent behavior
   *
   * @param {string} agentId - Agent being monitored
   * @param {string} observationType - Type of observation
   * @param {string} content - What was observed
   * @param {Object} context - Additional context
   * @returns {ScoutObservation} - Recorded observation
   */
  async observe(agentId, observationType, content, context = {}) {
    if (!this.options.enabled) return null;
    await this.initialize();

    const observation = {
      observation_id: this.generateId('obs'),
      timestamp: new Date().toISOString(),
      agent_id: agentId,
      observation_type: observationType,
      content,
      assumptions: context.assumptions || null,
      concern_level: 0,
      context,
    };

    // Analyze for concerns
    observation.concern_level = this.analyzeConcernLevel(observation);

    // Track for pattern detection
    this.observations.push(observation);
    if (this.observations.length > 100) {
      this.observations.shift(); // Keep bounded
    }

    // Track decisions for groupthink detection
    if (observationType === 'decision') {
      this.decisionHistory.push({
        content,
        timestamp: observation.timestamp,
        assumptions: context.assumptions,
      });
      if (this.decisionHistory.length > this.options.groupthinkWindow) {
        this.decisionHistory.shift();
      }
    }

    // Track assumption patterns
    if (context.assumptions) {
      this.trackAssumptionPattern(context.assumptions);
    }

    // Log to ContextLog if configured
    if (this.options.logToContextLog && this.options.contextLogger) {
      await this.options.contextLogger.appendEvent({
        actor: 'scout',
        act: 'observation',
        name: observationType,
        status: observation.concern_level > 0.7 ? 'warning' : 'ok',
        args_preview: content.slice(0, 200),
        result_preview: JSON.stringify({ concern_level: observation.concern_level }),
      });
    }

    return observation;
  }

  /**
   * Analyze concern level for an observation
   *
   * @param {ScoutObservation} observation
   * @returns {number} - Concern level 0-1
   */
  analyzeConcernLevel(observation) {
    let concernLevel = 0;

    // Check for low confidence claims
    if (observation.assumptions?.confidence === 'low') {
      concernLevel += 0.3;
    }

    // Check for many assumed constraints
    if (observation.assumptions?.assumed_constraints?.length > 5) {
      concernLevel += 0.2;
    }

    // Check for empty reconsider conditions
    if (observation.assumptions?.would_reconsider_if?.length === 0) {
      concernLevel += 0.2; // Agent isn't considering alternatives
    }

    // Check for vague content (very short or very long)
    const contentLength = observation.content?.length || 0;
    if (contentLength < 20 || contentLength > 2000) {
      concernLevel += 0.1;
    }

    return Math.min(1, concernLevel);
  }

  /**
   * Track assumption patterns for drift detection
   *
   * @param {AssumptionMetadata} assumptions
   */
  trackAssumptionPattern(assumptions) {
    const key = assumptions.primary_optimization || 'unknown';

    if (!this.assumptionPatterns.has(key)) {
      this.assumptionPatterns.set(key, { count: 0, first_seen: new Date().toISOString() });
    }

    const pattern = this.assumptionPatterns.get(key);
    pattern.count++;
    pattern.last_seen = new Date().toISOString();
  }

  /**
   * Generate a challenge for the agent
   *
   * @param {string} type - Challenge type
   * @param {string} description - Challenge description
   * @param {Object} context - Context data
   * @returns {ScoutChallenge} - Generated challenge
   */
  generateChallenge(type, description, context = {}) {
    const severity = this.determineSeverity(type, context);

    const challenge = {
      challenge_id: this.generateId('chal'),
      type,
      description,
      severity,
      timestamp: new Date().toISOString(),
      context,
      suggested_actions: this.generateSuggestedActions(type, context),
      acknowledged: false,
    };

    this.challenges.push(challenge);
    if (this.challenges.length > 50) {
      this.challenges.shift();
    }

    console.log(`[ScoutMonitor] Challenge generated: ${type} (${severity})`);

    return challenge;
  }

  /**
   * Determine severity of a challenge
   *
   * @param {string} type - Challenge type
   * @param {Object} context - Context data
   * @returns {'low'|'medium'|'high'|'critical'}
   */
  determineSeverity(type, context) {
    const severityMap = {
      assumption_drift: 'medium',
      goal_abandonment: 'high',
      value_conflict: 'critical',
      groupthink: 'medium',
      confidence_issue: 'low',
      bias_detected: 'high',
    };

    let severity = severityMap[type] || 'medium';

    // Escalate based on context
    if (context.consecutive_count > 5) {
      if (severity === 'low') severity = 'medium';
      else if (severity === 'medium') severity = 'high';
    }

    if (context.affects_critical_goal) {
      if (severity === 'medium') severity = 'high';
      else if (severity === 'high') severity = 'critical';
    }

    return severity;
  }

  /**
   * Generate suggested actions for a challenge
   *
   * @param {string} type - Challenge type
   * @param {Object} context - Context data
   * @returns {string[]} - Suggested actions
   */
  generateSuggestedActions(type, context) {
    const actions = {
      assumption_drift: [
        'Explicitly state your assumptions',
        'Consider alternative approaches',
        'Question whether constraints are still valid',
      ],
      goal_abandonment: [
        'Review the abandoned goal',
        'Document reason for abandonment',
        'Consider if goal should be deferred instead',
      ],
      value_conflict: [
        'Stop and reassess the situation',
        'Identify which values are in tension',
        'Seek clarification from user',
      ],
      groupthink: [
        'Consider contrarian viewpoint',
        'List downsides of current approach',
        'Seek external perspective',
      ],
      confidence_issue: [
        'Acknowledge uncertainty explicitly',
        'Gather more information before proceeding',
        'Present multiple options with tradeoffs',
      ],
      bias_detected: [
        'Question the underlying assumption',
        'Consider opposite hypothesis',
        'Seek disconfirming evidence',
      ],
    };

    return actions[type] || ['Review and reconsider'];
  }

  /**
   * Check agent state for identity issues and generate challenges
   *
   * @param {Object} identityState - Agent identity state
   * @returns {ScoutChallenge[]} - Generated challenges
   */
  async auditIdentityState(identityState) {
    const challenges = [];

    // Use built-in issue detection
    const issues = detectIdentityIssues(identityState);

    // Convert conflicts to challenges
    for (const conflict of issues.conflicts) {
      challenges.push(this.generateChallenge('value_conflict', conflict, {
        source: 'identity_audit',
      }));
    }

    // Convert drifts to challenges
    for (const drift of issues.drifts) {
      const type = drift.includes('goal') ? 'goal_abandonment' : 'assumption_drift';
      challenges.push(this.generateChallenge(type, drift, {
        source: 'identity_audit',
      }));
    }

    // Check for too many active goals (potential lack of focus)
    if ((identityState.active_goals || []).length > 7) {
      challenges.push(this.generateChallenge('assumption_drift',
        `Too many active goals (${identityState.active_goals.length}) may indicate difficulty prioritizing`, {
        source: 'identity_audit',
        goal_count: identityState.active_goals.length,
      }));
    }

    // Check for capability-limitation overlap
    const capabilities = new Set(identityState.capabilities || []);
    const limitations = identityState.limitations || [];
    for (const limitation of limitations) {
      if (capabilities.has(limitation)) {
        challenges.push(this.generateChallenge('value_conflict',
          `"${limitation}" appears in both capabilities and limitations`, {
          source: 'identity_audit',
        }));
      }
    }

    return challenges;
  }

  /**
   * Check for groupthink patterns in recent decisions
   *
   * @returns {ScoutChallenge|null} - Challenge if groupthink detected
   */
  detectGroupthink() {
    if (this.decisionHistory.length < this.options.groupthinkWindow / 2) {
      return null; // Not enough history
    }

    // Check if all recent decisions optimize for the same thing
    const optimizations = this.decisionHistory
      .filter(d => d.assumptions?.primary_optimization)
      .map(d => d.assumptions.primary_optimization);

    if (optimizations.length < 3) return null;

    const optimizationCounts = {};
    for (const opt of optimizations) {
      optimizationCounts[opt] = (optimizationCounts[opt] || 0) + 1;
    }

    const maxCount = Math.max(...Object.values(optimizationCounts));
    const dominantRatio = maxCount / optimizations.length;

    if (dominantRatio > 0.8) {
      const dominant = Object.entries(optimizationCounts)
        .find(([_, count]) => count === maxCount)[0];

      return this.generateChallenge('groupthink',
        `${Math.round(dominantRatio * 100)}% of recent decisions optimize for "${dominant}". Consider other factors.`, {
        dominant_optimization: dominant,
        ratio: dominantRatio,
        window_size: this.decisionHistory.length,
      });
    }

    return null;
  }

  /**
   * Check for assumption drift
   *
   * @returns {ScoutChallenge|null} - Challenge if drift detected
   */
  detectAssumptionDrift() {
    const threshold = this.options.assumptionDriftThreshold;

    for (const [optimization, data] of this.assumptionPatterns) {
      if (data.count >= threshold) {
        return this.generateChallenge('assumption_drift',
          `Assumption "${optimization}" has been used ${data.count} times consecutively. Is this still valid?`, {
          assumption: optimization,
          consecutive_count: data.count,
          first_seen: data.first_seen,
          last_seen: data.last_seen,
        });
      }
    }

    return null;
  }

  /**
   * Evaluate a claim and generate assumption metadata
   *
   * @param {string} claim - The claim being made
   * @param {Object} context - Context for the claim
   * @returns {AssumptionMetadata} - Structured assumption metadata
   */
  extractAssumptions(claim, context = {}) {
    // This is a structured template for assumption transparency
    // In production, this could be LLM-assisted

    const assumptions = {
      primary_optimization: context.optimization || 'task_completion',
      assumed_constraints: context.constraints || [],
      tradeoffs_accepted: context.tradeoffs || [],
      confidence: context.confidence || 'medium',
      would_reconsider_if: context.reconsider_conditions || [],
    };

    // Auto-detect some common patterns
    const claimLower = claim.toLowerCase();

    // Detect confidence indicators
    if (claimLower.includes('definitely') || claimLower.includes('certainly') ||
        claimLower.includes('always') || claimLower.includes('never')) {
      assumptions.confidence = 'high';
      assumptions.tradeoffs_accepted.push('Strong claim without hedging');
    }

    if (claimLower.includes('might') || claimLower.includes('possibly') ||
        claimLower.includes('perhaps') || claimLower.includes('unclear')) {
      assumptions.confidence = 'low';
    }

    // Detect assumed constraints
    if (claimLower.includes('assuming')) {
      const assumingIndex = claimLower.indexOf('assuming');
      const assumedPart = claim.slice(assumingIndex, assumingIndex + 100);
      assumptions.assumed_constraints.push(assumedPart.split(/[,.]/)[ 0 ]);
    }

    return assumptions;
  }

  /**
   * Generate formatted assumption transparency block
   *
   * @param {AssumptionMetadata} assumptions
   * @returns {string} - Formatted block
   */
  formatAssumptionTransparency(assumptions) {
    const lines = [
      '```assumption_transparency',
      `PRIMARY_OPTIMIZATION: ${assumptions.primary_optimization}`,
      `ASSUMED_CONSTRAINTS: ${assumptions.assumed_constraints.join(', ') || 'None stated'}`,
      `TRADEOFFS_ACCEPTED: ${assumptions.tradeoffs_accepted.join(', ') || 'None identified'}`,
      `CONFIDENCE: ${assumptions.confidence}`,
      `WOULD_RECONSIDER_IF: ${assumptions.would_reconsider_if.join(', ') || 'Not specified'}`,
      '```',
    ];
    return lines.join('\n');
  }

  /**
   * Inject a challenge into the reasoning context
   *
   * @param {ScoutChallenge} challenge
   * @returns {string} - Challenge prompt for injection
   */
  formatChallengeInjection(challenge) {
    const severityEmoji = {
      low: '',
      medium: '',
      high: '',
      critical: '',
    };

    const lines = [
      `${severityEmoji[challenge.severity]} **Scout Challenge** (${challenge.severity.toUpperCase()})`,
      '',
      challenge.description,
      '',
      '**Suggested Actions:**',
      ...challenge.suggested_actions.map(a => `- ${a}`),
      '',
      `_Challenge ID: ${challenge.challenge_id}_`,
    ];

    return lines.join('\n');
  }

  /**
   * Acknowledge a challenge (mark as handled)
   *
   * @param {string} challengeId - Challenge ID
   * @param {string} response - How challenge was addressed
   * @returns {boolean} - Whether challenge was found and acknowledged
   */
  acknowledgeChallenge(challengeId, response = '') {
    const challenge = this.challenges.find(c => c.challenge_id === challengeId);
    if (!challenge) return false;

    challenge.acknowledged = true;
    challenge.acknowledged_at = new Date().toISOString();
    challenge.acknowledgment_response = response;

    console.log(`[ScoutMonitor] Challenge ${challengeId} acknowledged`);
    return true;
  }

  /**
   * Get pending (unacknowledged) challenges
   *
   * @returns {ScoutChallenge[]} - Pending challenges
   */
  getPendingChallenges() {
    return this.challenges.filter(c => !c.acknowledged);
  }

  /**
   * Get statistics about scout monitoring
   *
   * @returns {Object} - Statistics
   */
  getStatistics() {
    const totalChallenges = this.challenges.length;
    const acknowledged = this.challenges.filter(c => c.acknowledged).length;
    const bySeverity = {};
    const byType = {};

    for (const challenge of this.challenges) {
      bySeverity[challenge.severity] = (bySeverity[challenge.severity] || 0) + 1;
      byType[challenge.type] = (byType[challenge.type] || 0) + 1;
    }

    return {
      total_observations: this.observations.length,
      total_challenges: totalChallenges,
      challenges_acknowledged: acknowledged,
      challenges_pending: totalChallenges - acknowledged,
      acknowledgment_rate: totalChallenges > 0 ? acknowledged / totalChallenges : 0,
      by_severity: bySeverity,
      by_type: byType,
      decision_history_size: this.decisionHistory.length,
      assumption_patterns_tracked: this.assumptionPatterns.size,
    };
  }

  /**
   * Run a full monitoring cycle
   *
   * @param {Object} identityState - Current identity state
   * @returns {Object} - Monitoring results
   */
  async runMonitoringCycle(identityState) {
    const results = {
      challenges: [],
      observations_analyzed: this.observations.length,
      concerns_detected: 0,
    };

    // Audit identity state
    const identityChallenges = await this.auditIdentityState(identityState);
    results.challenges.push(...identityChallenges);

    // Check for groupthink
    const groupthinkChallenge = this.detectGroupthink();
    if (groupthinkChallenge) {
      results.challenges.push(groupthinkChallenge);
    }

    // Check for assumption drift
    const driftChallenge = this.detectAssumptionDrift();
    if (driftChallenge) {
      results.challenges.push(driftChallenge);
    }

    // Count high-concern observations
    results.concerns_detected = this.observations.filter(o => o.concern_level > 0.5).length;

    // Log summary to ContextLog
    if (this.options.logToContextLog && this.options.contextLogger && results.challenges.length > 0) {
      await this.options.contextLogger.appendEvent({
        actor: 'scout',
        act: 'monitoring_cycle',
        name: 'cycle_complete',
        status: results.challenges.length > 0 ? 'warning' : 'ok',
        result_preview: JSON.stringify({
          challenges_generated: results.challenges.length,
          concerns_detected: results.concerns_detected,
        }),
      });
    }

    return results;
  }

  /**
   * Reset monitoring state (for testing or new sessions)
   */
  reset() {
    this.observations = [];
    this.challenges = [];
    this.decisionHistory = [];
    this.assumptionPatterns.clear();
    console.log('[ScoutMonitor] State reset');
  }
}

/**
 * Create a scout monitor instance
 *
 * @param {Object} options
 * @returns {ScoutMonitor}
 */
export function createScoutMonitor(options = {}) {
  return new ScoutMonitor(options);
}

export default {
  ScoutMonitor,
  createScoutMonitor,
};
