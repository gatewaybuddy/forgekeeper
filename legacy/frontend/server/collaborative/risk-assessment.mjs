/**
 * Risk Assessment Engine (Phase 8.1: T302)
 *
 * Automatically classifies operations by risk level to determine if approval is needed.
 *
 * Features:
 * - 4-level risk classification (low, medium, high, critical)
 * - Weighted risk factor scoring
 * - Operation pattern matching
 * - Configurable approval thresholds
 * - Context-aware risk assessment
 *
 * @module server.risk-assessment
 */

/**
 * @typedef {'low' | 'medium' | 'high' | 'critical'} RiskLevel
 */

/**
 * @typedef {'data' | 'code' | 'config' | 'external' | 'security'} RiskCategory
 */

/**
 * @typedef {Object} RiskFactor
 * @property {RiskCategory} category - Risk category
 * @property {string} description - Description of the risk
 * @property {number} weight - Weight/score contribution (0.0-1.0)
 */

/**
 * @typedef {Object} RiskAssessment
 * @property {RiskLevel} level - Overall risk level
 * @property {RiskFactor[]} factors - Contributing risk factors
 * @property {number} score - Numerical risk score (0.0-1.0)
 * @property {boolean} requiresApproval - Whether approval is required
 * @property {string} reasoning - Human-readable explanation
 */

/**
 * Get configuration from environment
 */
function getConfig() {
  // Minimum risk level requiring approval: low, medium, high, critical
  const approvalRequired = (process.env.AUTONOMOUS_APPROVAL_REQUIRED || 'high').toLowerCase();

  const levelMap = { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
  const approvalThreshold = levelMap[approvalRequired] || 0.75; // Default to 'high'

  return {
    approvalThreshold,
    approvalRequired,
  };
}

/**
 * Operation patterns and their base risk levels
 * Patterns are matched against operation names (case-insensitive)
 */
const OPERATION_PATTERNS = {
  // CRITICAL operations (score: 0.9-1.0)
  critical: [
    { pattern: /deploy.*production/i, score: 1.0, reason: 'Production deployment' },
    { pattern: /drop.*database/i, score: 1.0, reason: 'Database drop operation' },
    { pattern: /delete.*production/i, score: 1.0, reason: 'Production deletion' },
    { pattern: /rm.*-rf/i, score: 0.95, reason: 'Recursive force delete' },
    { pattern: /truncate/i, score: 0.9, reason: 'Data truncation' },
    { pattern: /security.*change/i, score: 0.95, reason: 'Security configuration change' },
    { pattern: /credentials.*update/i, score: 0.95, reason: 'Credential modification' },
  ],

  // HIGH risk operations (score: 0.7-0.85)
  high: [
    { pattern: /git.*push.*force/i, score: 0.80, reason: 'Force push to repository' },
    { pattern: /git.*commit.*production/i, score: 0.8, reason: 'Commit to production branch' },
    { pattern: /deploy/i, score: 0.75, reason: 'Deployment operation' },
    { pattern: /delete.*file/i, score: 0.75, reason: 'File deletion' },
    { pattern: /write.*config/i, score: 0.7, reason: 'Configuration write' },
    { pattern: /api.*call.*external/i, score: 0.75, reason: 'External API call' },
    { pattern: /database.*write/i, score: 0.75, reason: 'Database modification' },
    { pattern: /permission.*change/i, score: 0.75, reason: 'Permission modification' },
  ],

  // MEDIUM risk operations (score: 0.4-0.65)
  medium: [
    { pattern: /git.*commit/i, score: 0.6, reason: 'Git commit' },
    { pattern: /git.*push/i, score: 0.65, reason: 'Git push' },
    { pattern: /file.*write/i, score: 0.5, reason: 'File write operation' },
    { pattern: /code.*change/i, score: 0.55, reason: 'Code modification' },
    { pattern: /config.*read/i, score: 0.4, reason: 'Configuration read' },
    { pattern: /tool.*execution/i, score: 0.5, reason: 'Tool execution' },
    { pattern: /shell.*command/i, score: 0.6, reason: 'Shell command execution' },
  ],

  // LOW risk operations (score: 0.1-0.35)
  low: [
    { pattern: /read/i, score: 0.1, reason: 'Read operation' },
    { pattern: /list/i, score: 0.1, reason: 'List operation' },
    { pattern: /query/i, score: 0.15, reason: 'Query operation' },
    { pattern: /search/i, score: 0.15, reason: 'Search operation' },
    { pattern: /analyze/i, score: 0.2, reason: 'Analysis operation' },
    { pattern: /validate/i, score: 0.2, reason: 'Validation operation' },
  ],
};

/**
 * Context-based risk factors
 * Additional risk based on operation context
 */
const CONTEXT_RISK_FACTORS = {
  // Environment-based risks
  production: { weight: 0.3, category: 'external', description: 'Production environment' },
  staging: { weight: 0.1, category: 'external', description: 'Staging environment' },
  development: { weight: 0.0, category: 'external', description: 'Development environment' },

  // Data sensitivity
  sensitive_data: { weight: 0.2, category: 'security', description: 'Involves sensitive data' },
  pii: { weight: 0.25, category: 'security', description: 'Contains PII' },
  credentials: { weight: 0.3, category: 'security', description: 'Handles credentials' },

  // Operation scope
  batch_operation: { weight: 0.15, category: 'data', description: 'Batch/bulk operation' },
  irreversible: { weight: 0.2, category: 'data', description: 'Irreversible operation' },
  cascading: { weight: 0.15, category: 'data', description: 'Cascading changes' },

  // External interactions
  external_api: { weight: 0.15, category: 'external', description: 'External API interaction' },
  third_party: { weight: 0.15, category: 'external', description: 'Third-party service' },

  // Code changes
  breaking_change: { weight: 0.2, category: 'code', description: 'Breaking change' },
  no_tests: { weight: 0.15, category: 'code', description: 'No test coverage' },
  untested_code: { weight: 0.15, category: 'code', description: 'Untested code path' },
};

/**
 * Assess the risk level of an operation
 *
 * @param {string} operation - Operation name (e.g., 'git_commit', 'file_delete', 'deploy_production')
 * @param {Object} [context={}] - Additional context about the operation
 * @param {string} [context.environment] - Target environment (production, staging, dev)
 * @param {boolean} [context.irreversible] - Whether operation is irreversible
 * @param {boolean} [context.hasTests] - Whether changes are tested
 * @param {boolean} [context.sensitiveData] - Whether operation involves sensitive data
 * @param {boolean} [context.externalAPI] - Whether operation calls external APIs
 * @param {boolean} [context.batchOperation] - Whether it's a batch operation
 * @param {string[]} [context.tags] - Additional context tags
 * @returns {RiskAssessment} Risk assessment result
 */
export function assessRisk(operation, context = {}) {
  const factors = [];
  let baseScore = 0.0;
  let reasoning = '';

  // 1. Match operation against patterns
  let matched = false;
  for (const [level, patterns] of Object.entries(OPERATION_PATTERNS)) {
    for (const { pattern, score, reason } of patterns) {
      if (pattern.test(operation)) {
        baseScore = Math.max(baseScore, score);
        reasoning = reason;
        factors.push({
          category: 'code',
          description: `Operation matches ${level} risk pattern: ${reason}`,
          weight: score,
        });
        matched = true;
        break;
      }
    }
    if (matched) break;
  }

  // Default to medium risk if no pattern matched
  if (!matched) {
    baseScore = 0.5;
    reasoning = 'Unknown operation type';
    factors.push({
      category: 'code',
      description: 'Operation type not recognized, defaulting to medium risk',
      weight: 0.5,
    });
  }

  // 2. Apply context-based risk factors
  const contextFactors = [];

  // Ensure context is an object
  const ctx = context || {};

  // Environment
  if (ctx.environment) {
    const envLower = ctx.environment.toLowerCase();
    if (envLower.includes('prod')) {
      contextFactors.push({ ...CONTEXT_RISK_FACTORS.production });
    } else if (envLower.includes('stag')) {
      contextFactors.push({ ...CONTEXT_RISK_FACTORS.staging });
    } else {
      contextFactors.push({ ...CONTEXT_RISK_FACTORS.development });
    }
  }

  // Operation characteristics
  if (ctx.irreversible) {
    contextFactors.push({ ...CONTEXT_RISK_FACTORS.irreversible });
  }
  if (ctx.batchOperation) {
    contextFactors.push({ ...CONTEXT_RISK_FACTORS.batch_operation });
  }
  if (ctx.sensitiveData) {
    contextFactors.push({ ...CONTEXT_RISK_FACTORS.sensitive_data });
  }
  if (ctx.externalAPI) {
    contextFactors.push({ ...CONTEXT_RISK_FACTORS.external_api });
  }
  if (ctx.hasTests === false) {
    contextFactors.push({ ...CONTEXT_RISK_FACTORS.no_tests });
  }

  // Add context factors to total
  for (const factor of contextFactors) {
    factors.push(factor);
  }

  // 3. Calculate final score (base + context modifiers)
  const contextScore = contextFactors.reduce((sum, f) => sum + f.weight, 0);
  const finalScore = Math.min(1.0, baseScore + contextScore);

  // 4. Determine risk level from score
  let level;
  if (finalScore >= 0.85) {
    level = 'critical';
  } else if (finalScore >= 0.65) {
    level = 'high';
  } else if (finalScore >= 0.35) {
    level = 'medium';
  } else {
    level = 'low';
  }

  // 5. Determine if approval required based on config
  const config = getConfig();
  const requiresApproval = finalScore >= config.approvalThreshold;

  return {
    level,
    factors,
    score: parseFloat(finalScore.toFixed(2)),
    requiresApproval,
    reasoning: `${reasoning}${contextFactors.length > 0 ? ` (with ${contextFactors.length} context factor${contextFactors.length > 1 ? 's' : ''})` : ''}`,
  };
}

/**
 * Quick check if an operation requires approval
 *
 * @param {string} operation - Operation name
 * @param {Object} [context={}] - Operation context
 * @returns {boolean} True if approval required
 */
export function requiresApproval(operation, context = {}) {
  const assessment = assessRisk(operation, context);
  return assessment.requiresApproval;
}

/**
 * Get risk level for an operation (without full assessment)
 *
 * @param {string} operation - Operation name
 * @param {Object} [context={}] - Operation context
 * @returns {RiskLevel} Risk level
 */
export function getRiskLevel(operation, context = {}) {
  const assessment = assessRisk(operation, context);
  return assessment.level;
}

/**
 * Get human-readable risk explanation
 *
 * @param {RiskAssessment} assessment - Risk assessment result
 * @returns {string} Formatted explanation
 */
export function explainRisk(assessment) {
  const { level, score, reasoning, factors } = assessment;

  let explanation = `Risk Level: ${level.toUpperCase()} (score: ${score})\n`;
  explanation += `Primary Reason: ${reasoning}\n`;

  if (factors.length > 0) {
    explanation += '\nRisk Factors:\n';
    for (const factor of factors) {
      explanation += `  - [${factor.category}] ${factor.description} (weight: ${factor.weight})\n`;
    }
  }

  explanation += `\nApproval Required: ${assessment.requiresApproval ? 'YES' : 'NO'}`;

  return explanation;
}

/**
 * Get current risk assessment configuration
 *
 * @returns {Object} Current configuration
 */
export function getRiskConfig() {
  const config = getConfig();
  return {
    approvalThreshold: config.approvalThreshold,
    approvalRequired: config.approvalRequired,
    levels: {
      low: '0.0 - 0.34',
      medium: '0.35 - 0.64',
      high: '0.65 - 0.84',
      critical: '0.85 - 1.0',
    },
  };
}
