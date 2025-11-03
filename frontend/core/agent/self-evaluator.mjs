/**
 * Self-Evaluator Component
 *
 * Provides enhanced self-evaluation capabilities for the autonomous agent:
 * - Confidence calibration using historical accuracy
 * - Pattern recognition for success/failure modes
 * - Meta-cognitive monitoring (biases, overconfidence detection)
 * - Risk assessment before executing actions
 * - Strategy evaluation and self-correction
 *
 * @module frontend/core/agent/self-evaluator
 */

/**
 * SelfEvaluator - Enhanced reflection and self-awareness
 */
export class SelfEvaluator {
  constructor(config = {}) {
    this.config = {
      minSamplesForCalibration: config.minSamplesForCalibration || 3,
      overconfidenceThreshold: config.overconfidenceThreshold || 0.3, // 30% error
      underconfidenceThreshold: config.underconfidenceThreshold || 0.15, // 15% error
      patternMinOccurrences: config.patternMinOccurrences || 2,
      ...config,
    };

    // Historical tracking
    this.accuracyHistory = []; // { prediction, actual, error, context }
    this.successPatterns = []; // { pattern, occurrences, successRate }
    this.failurePatterns = []; // { pattern, occurrences, commonErrors }
    this.biasTracking = {
      overconfidenceCount: 0,
      underconfidenceCount: 0,
      optimismBias: 0, // Tendency to overestimate progress
      repetitionBlindness: 0, // Missing repetitive failures
    };
  }

  /**
   * Calibrate confidence score based on historical accuracy
   *
   * Adjusts agent's confidence based on past performance:
   * - If historically overconfident → reduce confidence
   * - If historically underconfident → increase confidence
   * - If well-calibrated → keep as-is
   *
   * @param {number} rawConfidence - Agent's initial confidence (0-1)
   * @param {Object} context - Current context (task type, tool, etc.)
   * @returns {Object} { calibrated: number, adjustment: number, reason: string }
   */
  calibrateConfidence(rawConfidence, context = {}) {
    if (this.accuracyHistory.length < this.config.minSamplesForCalibration) {
      return {
        calibrated: rawConfidence,
        adjustment: 0,
        reason: 'Insufficient history for calibration',
      };
    }

    // Calculate recent accuracy rate
    const recentAccuracy = this.accuracyHistory.slice(-5);
    const avgError = recentAccuracy.reduce((sum, h) => sum + h.error, 0) / recentAccuracy.length;

    let adjustment = 0;
    let reason = '';

    // Overconfidence correction
    if (avgError > this.config.overconfidenceThreshold) {
      adjustment = -0.15; // Reduce confidence by 15%
      reason = `Historical overconfidence detected (avg error: ${(avgError * 100).toFixed(0)}%)`;
      this.biasTracking.overconfidenceCount++;
    }
    // Underconfidence correction
    else if (avgError < this.config.underconfidenceThreshold) {
      adjustment = +0.10; // Increase confidence by 10%
      reason = `Historical underconfidence detected (avg error: ${(avgError * 100).toFixed(0)}%)`;
      this.biasTracking.underconfidenceCount++;
    }
    // Well calibrated
    else {
      reason = `Well calibrated (avg error: ${(avgError * 100).toFixed(0)}%)`;
    }

    // Context-specific adjustments
    if (context.taskType) {
      const taskAccuracy = this.getTaskTypeAccuracy(context.taskType);
      if (taskAccuracy && taskAccuracy.samples >= 2) {
        if (taskAccuracy.avgError > 0.25) {
          adjustment -= 0.10;
          reason += ` | Weak track record for ${context.taskType} tasks`;
        }
      }
    }

    const calibrated = Math.max(0.1, Math.min(0.95, rawConfidence + adjustment));

    return { calibrated, adjustment, reason };
  }

  /**
   * Record accuracy of a prediction for future calibration
   *
   * @param {Object} prediction - What was predicted
   * @param {Object} actual - What actually happened
   * @param {Object} context - Context of the prediction
   */
  recordAccuracy(prediction, actual, context = {}) {
    const error = Math.abs((prediction.confidence || 0) - (actual.success ? 1 : 0));

    this.accuracyHistory.push({
      ts: Date.now(),
      prediction,
      actual,
      error,
      context,
    });

    // Keep last 20 entries
    if (this.accuracyHistory.length > 20) {
      this.accuracyHistory.shift();
    }

    // Update bias tracking
    if (prediction.progressEstimate && actual.progressActual) {
      const progressError = prediction.progressEstimate - actual.progressActual;
      this.biasTracking.optimismBias += progressError; // Positive = too optimistic
    }
  }

  /**
   * Get accuracy statistics for a specific task type
   *
   * @param {string} taskType - Task type (e.g., 'file_creation', 'debugging', 'refactoring')
   * @returns {Object|null} { avgError, samples, successRate }
   */
  getTaskTypeAccuracy(taskType) {
    const relevant = this.accuracyHistory.filter(h => h.context.taskType === taskType);
    if (relevant.length === 0) return null;

    const avgError = relevant.reduce((sum, h) => sum + h.error, 0) / relevant.length;
    const successRate = relevant.filter(h => h.actual.success).length / relevant.length;

    return { avgError, samples: relevant.length, successRate };
  }

  /**
   * Detect success patterns in agent behavior
   *
   * Identifies what strategies/approaches lead to success:
   * - Tool sequences that work well
   * - Reasoning patterns that predict success
   * - Contextual factors correlated with success
   *
   * @param {Object} iteration - Completed iteration details
   * @returns {Array<Object>} Detected patterns
   */
  detectSuccessPatterns(iteration) {
    const patterns = [];

    if (!iteration || !iteration.success) return patterns;

    // Pattern 1: Tool sequence
    if (iteration.toolsUsed && iteration.toolsUsed.length > 0) {
      const toolSeq = iteration.toolsUsed.join(' → ');
      const existingPattern = this.successPatterns.find(p => p.pattern === toolSeq);

      if (existingPattern) {
        existingPattern.occurrences++;
        existingPattern.successRate =
          (existingPattern.successRate * (existingPattern.occurrences - 1) + 1) /
          existingPattern.occurrences;
      } else {
        this.successPatterns.push({
          type: 'tool_sequence',
          pattern: toolSeq,
          occurrences: 1,
          successRate: 1.0,
          context: { taskType: iteration.taskType },
        });
      }

      if (existingPattern && existingPattern.occurrences >= this.config.patternMinOccurrences) {
        patterns.push({
          type: 'tool_sequence',
          pattern: toolSeq,
          confidence: existingPattern.successRate,
          recommendation: `This tool sequence has worked ${existingPattern.occurrences} times (${(existingPattern.successRate * 100).toFixed(0)}% success rate)`,
        });
      }
    }

    // Pattern 2: Reasoning approach
    if (iteration.reasoning) {
      const reasoningKeywords = this.extractReasoningKeywords(iteration.reasoning);
      for (const keyword of reasoningKeywords) {
        const existingPattern = this.successPatterns.find(
          p => p.type === 'reasoning' && p.pattern === keyword
        );

        if (existingPattern) {
          existingPattern.occurrences++;
        } else {
          this.successPatterns.push({
            type: 'reasoning',
            pattern: keyword,
            occurrences: 1,
            successRate: 1.0,
          });
        }
      }
    }

    // Pattern 3: Task type success
    if (iteration.taskType) {
      const taskPattern = this.successPatterns.find(
        p => p.type === 'task_type' && p.pattern === iteration.taskType
      );

      if (taskPattern) {
        taskPattern.occurrences++;
        taskPattern.successRate =
          (taskPattern.successRate * (taskPattern.occurrences - 1) + 1) /
          taskPattern.occurrences;

        if (taskPattern.occurrences >= 3 && taskPattern.successRate > 0.7) {
          patterns.push({
            type: 'task_type',
            pattern: iteration.taskType,
            confidence: taskPattern.successRate,
            recommendation: `Strong track record with ${iteration.taskType} tasks (${(taskPattern.successRate * 100).toFixed(0)}% success)`,
          });
        }
      } else {
        this.successPatterns.push({
          type: 'task_type',
          pattern: iteration.taskType,
          occurrences: 1,
          successRate: 1.0,
        });
      }
    }

    return patterns;
  }

  /**
   * Detect failure patterns to avoid
   *
   * @param {Object} iteration - Failed iteration details
   * @returns {Array<Object>} Detected patterns
   */
  detectFailurePatterns(iteration) {
    const patterns = [];

    if (!iteration || iteration.success) return patterns;

    // Pattern 1: Repeated tool failures
    if (iteration.toolsUsed && iteration.toolsUsed.length > 0) {
      const toolSeq = iteration.toolsUsed.join(' → ');
      const existingPattern = this.failurePatterns.find(p => p.pattern === toolSeq);

      if (existingPattern) {
        existingPattern.occurrences++;
        existingPattern.commonErrors.push(iteration.error);
      } else {
        this.failurePatterns.push({
          type: 'tool_sequence',
          pattern: toolSeq,
          occurrences: 1,
          commonErrors: [iteration.error],
        });
      }

      if (existingPattern && existingPattern.occurrences >= this.config.patternMinOccurrences) {
        patterns.push({
          type: 'repeated_failure',
          pattern: toolSeq,
          occurrences: existingPattern.occurrences,
          warning: `This tool sequence has failed ${existingPattern.occurrences} times. Consider alternative approach.`,
        });
      }
    }

    // Pattern 2: Error category patterns
    if (iteration.error && iteration.error.code) {
      const errorPattern = this.failurePatterns.find(
        p => p.type === 'error_code' && p.pattern === iteration.error.code
      );

      if (errorPattern) {
        errorPattern.occurrences++;
      } else {
        this.failurePatterns.push({
          type: 'error_code',
          pattern: iteration.error.code,
          occurrences: 1,
          commonErrors: [iteration.error.message],
        });
      }
    }

    return patterns;
  }

  /**
   * Meta-cognitive monitoring - detect biases and blindspots
   *
   * @returns {Object} { biases: Array, recommendations: Array }
   */
  detectBiases() {
    const biases = [];
    const recommendations = [];

    // Bias 1: Persistent overconfidence
    if (this.biasTracking.overconfidenceCount >= 3) {
      biases.push({
        type: 'overconfidence',
        severity: 'moderate',
        description: `Detected overconfidence in ${this.biasTracking.overconfidenceCount} recent predictions`,
      });
      recommendations.push('Reduce confidence estimates by 10-15% for similar tasks');
    }

    // Bias 2: Optimism bias (overestimating progress)
    const avgOptimism = this.biasTracking.optimismBias / Math.max(1, this.accuracyHistory.length);
    if (avgOptimism > 15) {
      biases.push({
        type: 'optimism',
        severity: 'moderate',
        description: `Tendency to overestimate progress by ${avgOptimism.toFixed(0)}% on average`,
      });
      recommendations.push('Be more conservative with progress estimates');
    }

    // Bias 3: Repetition blindness
    const recentFailures = this.failurePatterns.filter(p => p.occurrences >= 2);
    if (recentFailures.length > 0) {
      biases.push({
        type: 'repetition_blindness',
        severity: 'high',
        description: `Repeating ${recentFailures.length} failed approaches`,
      });
      recommendations.push('Try alternative tools or strategies for recurring failures');
    }

    return { biases, recommendations };
  }

  /**
   * Assess risk before executing an action
   *
   * @param {Object} plannedAction - Action about to be executed
   * @param {Object} context - Current context
   * @returns {Object} { riskLevel: string, factors: Array, shouldProceed: boolean }
   */
  assessRisk(plannedAction, context = {}) {
    const factors = [];
    let riskScore = 0;

    // Factor 1: Historical success rate with this action
    const similarActions = this.accuracyHistory.filter(h =>
      h.prediction.action === plannedAction.action ||
      h.prediction.tool === plannedAction.tool
    );

    if (similarActions.length > 0) {
      const successRate = similarActions.filter(h => h.actual.success).length / similarActions.length;
      if (successRate < 0.5) {
        riskScore += 30;
        factors.push({
          type: 'low_historical_success',
          score: 30,
          description: `Low success rate (${(successRate * 100).toFixed(0)}%) with similar actions`,
        });
      }
    }

    // Factor 2: Recent failures
    if (context.consecutiveFailures >= 2) {
      riskScore += 25;
      factors.push({
        type: 'consecutive_failures',
        score: 25,
        description: `${context.consecutiveFailures} consecutive failures - agent may be stuck`,
      });
    }

    // Factor 3: Repetition of failed approach
    const failedPattern = this.failurePatterns.find(p =>
      p.pattern.includes(plannedAction.tool) && p.occurrences >= 2
    );
    if (failedPattern) {
      riskScore += 35;
      factors.push({
        type: 'repeated_failure_pattern',
        score: 35,
        description: `This approach has failed ${failedPattern.occurrences} times before`,
      });
    }

    // Factor 4: Low confidence
    if (plannedAction.confidence < 0.4) {
      riskScore += 20;
      factors.push({
        type: 'low_confidence',
        score: 20,
        description: `Agent has low confidence (${(plannedAction.confidence * 100).toFixed(0)}%) in this action`,
      });
    }

    // Determine risk level
    let riskLevel = 'low';
    if (riskScore >= 60) {
      riskLevel = 'high';
    } else if (riskScore >= 30) {
      riskLevel = 'moderate';
    }

    const shouldProceed = riskScore < 70; // Don't proceed if risk >70

    return {
      riskLevel,
      riskScore,
      factors,
      shouldProceed,
      recommendation: shouldProceed
        ? 'Proceed with action'
        : 'Consider alternative approach - risk too high',
    };
  }

  /**
   * Generate self-evaluation summary for reflection prompt
   *
   * @returns {string} Formatted guidance text
   */
  generateGuidance() {
    let guidance = '';

    // Confidence calibration guidance
    if (this.accuracyHistory.length >= this.config.minSamplesForCalibration) {
      const recentAccuracy = this.accuracyHistory.slice(-5);
      const avgError = recentAccuracy.reduce((sum, h) => sum + h.error, 0) / recentAccuracy.length;

      guidance += `\n## 🎯 Confidence Calibration\n\n`;
      guidance += `Based on your recent ${recentAccuracy.length} predictions:\n`;
      guidance += `- Average confidence error: ${(avgError * 100).toFixed(0)}%\n`;

      if (avgError > this.config.overconfidenceThreshold) {
        guidance += `- ⚠️ **Overconfidence detected** - You tend to be too confident. Reduce estimates by ~15%.\n`;
      } else if (avgError < this.config.underconfidenceThreshold) {
        guidance += `- ℹ️ **Underconfidence detected** - You're more capable than you think. Trust your assessments.\n`;
      } else {
        guidance += `- ✓ **Well calibrated** - Your confidence estimates are accurate.\n`;
      }
    }

    // Bias warnings
    const { biases, recommendations } = this.detectBiases();
    if (biases.length > 0) {
      guidance += `\n## ⚠️ Self-Awareness: Detected Biases\n\n`;
      for (const bias of biases) {
        guidance += `- **${bias.type}** (${bias.severity}): ${bias.description}\n`;
      }
      guidance += `\n**Recommendations**:\n`;
      for (const rec of recommendations) {
        guidance += `- ${rec}\n`;
      }
    }

    // Success patterns
    const topPatterns = this.successPatterns
      .filter(p => p.occurrences >= this.config.patternMinOccurrences)
      .sort((a, b) => (b.successRate * b.occurrences) - (a.successRate * a.occurrences))
      .slice(0, 3);

    if (topPatterns.length > 0) {
      guidance += `\n## ✅ What Works Well\n\n`;
      for (const pattern of topPatterns) {
        guidance += `- **${pattern.pattern}**: ${pattern.occurrences} successes (${(pattern.successRate * 100).toFixed(0)}% rate)\n`;
      }
    }

    // Failure patterns to avoid
    const topFailures = this.failurePatterns
      .filter(p => p.occurrences >= 2)
      .slice(0, 3);

    if (topFailures.length > 0) {
      guidance += `\n## ❌ What to Avoid\n\n`;
      for (const pattern of topFailures) {
        guidance += `- **${pattern.pattern}**: Failed ${pattern.occurrences} times\n`;
      }
      guidance += `\n**Try alternative approaches instead.**\n`;
    }

    return guidance;
  }

  /**
   * Extract reasoning keywords for pattern matching
   *
   * @param {string} reasoning - Reasoning text
   * @returns {Array<string>} Keywords
   */
  extractReasoningKeywords(reasoning) {
    const keywords = [];
    const text = reasoning.toLowerCase();

    const patterns = [
      { keyword: 'verify_first', regex: /verif|check|test.*first/i },
      { keyword: 'break_down', regex: /break.*down|split|decompose/i },
      { keyword: 'incremental', regex: /increment|step.*by.*step|one.*at.*time/i },
      { keyword: 'research_first', regex: /research|explore|investigate.*first/i },
    ];

    for (const { keyword, regex } of patterns) {
      if (regex.test(text)) {
        keywords.push(keyword);
      }
    }

    return keywords;
  }

  /**
   * Get self-evaluation metrics
   *
   * @returns {Object} Metrics summary
   */
  getMetrics() {
    return {
      accuracyHistory: {
        count: this.accuracyHistory.length,
        recentAvgError: this.accuracyHistory.length > 0
          ? this.accuracyHistory.slice(-5).reduce((sum, h) => sum + h.error, 0) / Math.min(5, this.accuracyHistory.length)
          : 0,
      },
      biases: this.biasTracking,
      successPatterns: {
        count: this.successPatterns.length,
        top: this.successPatterns
          .sort((a, b) => (b.successRate * b.occurrences) - (a.successRate * a.occurrences))
          .slice(0, 3),
      },
      failurePatterns: {
        count: this.failurePatterns.length,
        top: this.failurePatterns
          .sort((a, b) => b.occurrences - a.occurrences)
          .slice(0, 3),
      },
    };
  }
}
