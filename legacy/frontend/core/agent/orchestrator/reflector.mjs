/**
 * Reflector for Autonomous Agent
 *
 * Handles self-evaluation and meta-cognition:
 * - Reflection accuracy scoring
 * - Planning accuracy assessment
 * - Progress tracking
 * - Stopping criteria
 * - Result building and summarization
 *
 * Extracted from autonomous.mjs to improve modularity and testability.
 */

import { ulid } from 'ulid';
import { contextLogEvents } from '../../services/contextlog-events.mjs';

/**
 * Reflector - self-evaluation and meta-cognition
 */
export class Reflector {
  /**
   * @param {Object} config - Configuration object
   * @param {number} config.maxIterations - Maximum iterations
   * @param {number} config.errorThreshold - Maximum errors before stopping
   * @param {boolean} config.interactiveMode - Whether interactive mode is enabled
   */
  constructor(config) {
    this.maxIterations = config.maxIterations || 50;
    this.errorThreshold = config.errorThreshold || 5;
    this.interactiveMode = config.interactiveMode || false;
  }

  /**
   * Score reflection accuracy by comparing prediction to actual outcome
   *
   * @param {Object} previousReflection - The reflection from last iteration
   * @param {Object} actualOutcome - What actually happened
   * @returns {Object} Accuracy scores
   */
  scoreReflectionAccuracy(previousReflection, actualOutcome) {
    const scores = {
      progress_error: 0,
      confidence_error: 0,
      assessment_correct: false,
      overall_accuracy: 0,
    };

    if (!previousReflection || !actualOutcome) {
      return scores;
    }

    // 1. Progress estimate accuracy
    const progressPredicted = previousReflection.progress_percent || 0;
    const progressActual = actualOutcome.progress_percent || 0;
    const progressError = Math.abs(progressPredicted - progressActual);
    scores.progress_error = progressError;

    // 2. Confidence calibration
    // If confident (>0.7) but action failed, that's poor calibration
    // If not confident (<0.5) but action succeeded, also poor calibration
    const wasConfident = previousReflection.confidence > 0.7;
    const actionSucceeded = !actualOutcome.result.includes('ERROR');

    if (wasConfident && !actionSucceeded) {
      scores.confidence_error = 0.8; // Overconfident
    } else if (!wasConfident && actionSucceeded) {
      scores.confidence_error = 0.3; // Underconfident
    } else {
      scores.confidence_error = 0.1; // Well calibrated
    }

    // 3. Assessment accuracy
    // Did we predict 'continue' correctly?
    scores.assessment_correct = previousReflection.assessment === actualOutcome.assessment;

    // 4. Overall accuracy (0-100 scale)
    const progressAccuracy = Math.max(0, 100 - progressError);
    const confidenceAccuracy = (1 - scores.confidence_error) * 100;
    const assessmentAccuracy = scores.assessment_correct ? 100 : 0;

    scores.overall_accuracy = Math.round(
      (progressAccuracy * 0.4) +
      (confidenceAccuracy * 0.3) +
      (assessmentAccuracy * 0.3)
    );

    return scores;
  }

  /**
   * Meta-reflection: Critique own previous reasoning
   *
   * @param {Object} previousReflection - The reflection from last iteration
   * @param {Object} actualOutcome - What actually happened
   * @param {Object} accuracyScores - Scores from scoreReflectionAccuracy()
   * @returns {string} Critique text
   */
  metaReflect(previousReflection, actualOutcome, accuracyScores) {
    if (!previousReflection || !actualOutcome) {
      return '';
    }

    let critique = `\n## 🔍 Meta-Reflection: Critiquing My Previous Reasoning\n\n`;
    critique += `### Last Iteration's Prediction vs Reality\n\n`;

    // Progress prediction
    critique += `**Progress Estimate**:\n`;
    critique += `- I predicted: ${previousReflection.progress_percent}%\n`;
    critique += `- Actual progress: ${actualOutcome.progress_percent}%\n`;
    critique += `- Error: ${accuracyScores.progress_error}%`;

    if (accuracyScores.progress_error > 20) {
      critique += ` ⚠️ SIGNIFICANT ERROR - I was too ${previousReflection.progress_percent > actualOutcome.progress_percent ? 'optimistic' : 'pessimistic'}`;
    } else if (accuracyScores.progress_error < 10) {
      critique += ` ✓ Good estimate`;
    }
    critique += `\n\n`;

    // Confidence calibration
    critique += `**Confidence Calibration**:\n`;
    critique += `- I was ${(previousReflection.confidence * 100).toFixed(0)}% confident\n`;

    const actionSucceeded = !actualOutcome.result.includes('ERROR');
    critique += `- Action ${actionSucceeded ? 'SUCCEEDED' : 'FAILED'}\n`;

    if (previousReflection.confidence > 0.7 && !actionSucceeded) {
      critique += `- ⚠️ OVERCONFIDENT - I was ${(previousReflection.confidence * 100).toFixed(0)}% sure but failed. Reduce confidence for similar actions.\n`;
    } else if (previousReflection.confidence < 0.5 && actionSucceeded) {
      critique += `- ℹ️ UNDERCONFIDENT - I was uncertain but succeeded. Can be more confident.\n`;
    } else {
      critique += `- ✓ Well calibrated\n`;
    }
    critique += `\n`;

    // Reasoning critique
    if (previousReflection.reasoning) {
      critique += `**My Previous Reasoning**:\n`;
      critique += `"${previousReflection.reasoning.slice(0, 200)}${previousReflection.reasoning.length > 200 ? '...' : ''}"\n\n`;

      critique += `**What I Should Learn**:\n`;

      if (!actionSucceeded) {
        critique += `- My reasoning led to failure. `;
        if (previousReflection.reasoning.includes('http_fetch') || previousReflection.reasoning.includes('HTTP')) {
          critique += `HTTP/fetch approach was wrong for this task. Use shell commands instead.\n`;
        } else {
          critique += `This approach didn't work. Try a fundamentally different strategy.\n`;
        }
      } else if (accuracyScores.progress_error > 20) {
        critique += `- My reasoning was partially correct but I misjudged the complexity.\n`;
        if (previousReflection.progress_percent > actualOutcome.progress_percent) {
          critique += `- Task was harder than expected. Be more conservative with progress estimates.\n`;
        } else {
          critique += `- Task was easier than expected. Can be more optimistic.\n`;
        }
      } else {
        critique += `- ✓ My reasoning was sound and led to good results.\n`;
      }
    }

    critique += `\n**Overall Reflection Accuracy**: ${accuracyScores.overall_accuracy}%\n`;

    return critique;
  }

  /**
   * Build meta-reflection guidance for reflection prompt
   *
   * @param {Array} reflectionAccuracy - Array of accuracy scores
   * @returns {string} Meta-reflection guidance
   */
  buildMetaReflectionGuidance(reflectionAccuracy) {
    if (!reflectionAccuracy || reflectionAccuracy.length === 0) {
      return '';
    }

    // Get last 3 accuracy scores
    const recentScores = reflectionAccuracy.slice(-3);

    let guidance = `\n## 📊 My Prediction Accuracy Track Record\n\n`;
    guidance += `Recent reflection accuracy:\n`;

    recentScores.forEach((score) => {
      const iter = score.iteration;
      guidance += `- Iteration ${iter}: ${score.overall_accuracy}% accuracy`;

      if (score.progress_error > 20) {
        guidance += ` (progress estimate off by ${score.progress_error}%)`;
      }
      if (score.confidence_error > 0.5) {
        guidance += ` (${score.wasOverconfident ? 'overconfident' : 'underconfident'})`;
      }

      guidance += `\n`;
    });

    // Calculate average accuracy
    const avgAccuracy = Math.round(
      recentScores.reduce((sum, s) => sum + s.overall_accuracy, 0) / recentScores.length
    );

    guidance += `\n**Average Accuracy**: ${avgAccuracy}%\n\n`;

    if (avgAccuracy < 50) {
      guidance += `⚠️ **LOW ACCURACY** - My predictions have been poor. I need to:\n`;
      guidance += `- Be more careful with progress estimates\n`;
      guidance += `- Reduce confidence when trying new approaches\n`;
      guidance += `- Think more critically about what can go wrong\n\n`;
    } else if (avgAccuracy < 70) {
      guidance += `ℹ️ **MODERATE ACCURACY** - Room for improvement. Focus on:\n`;
      guidance += `- Better calibration of confidence levels\n`;
      guidance += `- More realistic progress estimates\n\n`;
    } else {
      guidance += `✓ **GOOD ACCURACY** - My predictions are reliable. Keep it up!\n\n`;
    }

    return guidance;
  }

  /**
   * Score planning accuracy by comparing plan to actual execution
   *
   * @param {Object} instructionPlan - The plan from task planner
   * @param {Object} executionResult - What actually happened
   * @returns {Object} Planning feedback
   */
  scorePlanningAccuracy(instructionPlan, executionResult) {
    const feedback = {
      planConfidence: instructionPlan.overallConfidence,
      planSucceeded: false,
      stepsPlanned: instructionPlan.steps.length,
      stepsExecuted: executionResult.tools_used.length,
      toolsMatchedPlan: 0,
      confidenceCalibration: 0,
      analysis: '',
    };

    // Check if planned tools were actually used
    const plannedTools = instructionPlan.steps.map(s => s.tool);
    const actualTools = executionResult.tools_used;

    // Count how many tools matched
    plannedTools.forEach((plannedTool, idx) => {
      if (actualTools[idx] === plannedTool) {
        feedback.toolsMatchedPlan++;
      }
    });

    // Determine if plan succeeded
    feedback.planSucceeded = !executionResult.summary.includes('ERROR');

    // Confidence calibration
    // High confidence + success = good
    // High confidence + failure = overconfident
    // Low confidence + success = underconfident
    // Low confidence + failure = good
    if (instructionPlan.overallConfidence > 0.7) {
      if (feedback.planSucceeded) {
        feedback.confidenceCalibration = 1.0; // Well calibrated (confident and succeeded)
      } else {
        feedback.confidenceCalibration = 0.2; // Overconfident (confident but failed)
      }
    } else {
      if (feedback.planSucceeded) {
        feedback.confidenceCalibration = 0.5; // Underconfident (succeeded despite low confidence)
      } else {
        feedback.confidenceCalibration = 0.8; // Appropriately cautious (low confidence, did fail)
      }
    }

    // Generate analysis
    let analysis = '';
    if (feedback.planSucceeded && feedback.toolsMatchedPlan === plannedTools.length) {
      analysis = 'Plan was accurate - all tools used as planned and succeeded.';
    } else if (feedback.planSucceeded && feedback.toolsMatchedPlan > 0) {
      analysis = `Plan partially accurate - ${feedback.toolsMatchedPlan}/${plannedTools.length} tools matched, but succeeded.`;
    } else if (!feedback.planSucceeded && instructionPlan.overallConfidence > 0.7) {
      analysis = 'Planner was overconfident - high confidence but execution failed.';
    } else if (!feedback.planSucceeded) {
      const wrongTools = plannedTools.filter((tool, idx) => actualTools[idx] !== tool);
      analysis = `Plan failed. Wrong tools: ${wrongTools.join(', ')}. Actual tools used: ${actualTools.join(', ')}.`;
    } else {
      analysis = 'Plan succeeded but with different approach than predicted.';
    }

    feedback.analysis = analysis;

    return feedback;
  }

  /**
   * Build planning feedback guidance for reflection prompt
   *
   * @param {Array} planningFeedback - Array of planning feedback objects
   * @returns {string} Planning feedback guidance
   */
  buildPlanningFeedbackGuidance(planningFeedback) {
    if (!planningFeedback || planningFeedback.length === 0) {
      return '';
    }

    const recentFeedback = planningFeedback.slice(-3);

    let guidance = `\n## 🎯 Task Planner Track Record\n\n`;
    guidance += `Recent planning accuracy:\n`;

    recentFeedback.forEach(fb => {
      guidance += `- Iteration ${fb.iteration}: ${fb.planSucceeded ? '✓ SUCCESS' : '✗ FAILED'}`;
      guidance += ` (confidence: ${(fb.planConfidence * 100).toFixed(0)}%)`;

      if (fb.toolsMatchedPlan > 0 && fb.stepsPlanned > 0) {
        guidance += ` - ${fb.toolsMatchedPlan}/${fb.stepsPlanned} tools matched plan`;
      }

      guidance += `\n  ${fb.analysis}\n`;
    });

    // Calculate success rate
    const successCount = recentFeedback.filter(fb => fb.planSucceeded).length;
    const successRate = Math.round((successCount / recentFeedback.length) * 100);

    guidance += `\n**Success Rate**: ${successRate}% (${successCount}/${recentFeedback.length})\n\n`;

    // Calculate average confidence calibration
    const avgCalibration = recentFeedback.reduce((sum, fb) => sum + fb.confidenceCalibration, 0) / recentFeedback.length;

    if (avgCalibration < 0.5) {
      guidance += `⚠️ **POOR CALIBRATION** - Planner is overconfident. Reduce reliance on high-confidence plans.\n\n`;
    } else if (avgCalibration < 0.8) {
      guidance += `ℹ️ **MODERATE CALIBRATION** - Planner sometimes misjudges difficulty. Double-check high-confidence plans.\n\n`;
    } else {
      guidance += `✓ **GOOD CALIBRATION** - Planner's confidence levels are reliable.\n\n`;
    }

    return guidance;
  }

  /**
   * Check if agent should stop
   *
   * @param {Object} state - Current agent state
   * @param {boolean} waitingForClarification - Whether agent is waiting for user input
   * @returns {Object} Stop decision with reason
   */
  shouldStop(state, waitingForClarification = false) {
    // Hard limits
    if (state.iteration >= this.maxIterations) {
      return { stop: true, reason: 'max_iterations' };
    }

    if (state.errors >= this.errorThreshold) {
      return { stop: true, reason: 'too_many_errors' };
    }

    // Self-assessment: Task complete
    if (state.taskComplete && state.confidence >= 0.9) {
      return {
        stop: true,
        reason: 'task_complete',
        confidence: state.confidence,
      };
    }

    // Repetitive action detection - with interactive mode option
    if (state.repetitiveActionDetected) {
      if (this.interactiveMode && !waitingForClarification) {
        return { stop: false, needsClarification: true, reason: 'repetitive_actions' };
      }
      return { stop: true, reason: 'repetitive_actions' };
    }

    // Stuck loop detection - with interactive mode option
    if (state.actionHistory && state.actionHistory.length >= 3) {
      const last3 = state.actionHistory.slice(-3);
      const uniqueLast3 = new Set(last3);
      if (uniqueLast3.size === 1) {
        // Same exact action 3 times consecutively
        if (this.interactiveMode && !waitingForClarification) {
          return { stop: false, needsClarification: true, reason: 'stuck_loop' };
        }
        return { stop: true, reason: 'stuck_loop' };
      }
    }

    // Stuck detection (no progress) - with interactive mode option
    if (state.noProgressCount >= 3) {
      console.log(`[Reflector] No progress detected. InteractiveMode: ${this.interactiveMode}, Waiting: ${waitingForClarification}`);
      if (this.interactiveMode && !waitingForClarification) {
        console.log(`[Reflector] Requesting clarification for no_progress`);
        return { stop: false, needsClarification: true, reason: 'no_progress' };
      }
      return { stop: true, reason: 'no_progress' };
    }

    return { stop: false };
  }

  /**
   * Build final result object
   *
   * @param {Object} state - Current agent state
   * @param {string} reason - Reason for stopping
   * @returns {Object} Autonomous result
   */
  buildResult(state, reason) {
    return {
      completed: reason === 'task_complete',
      reason,
      iterations: state.iteration,
      confidence: state.confidence,
      history: state.history,
      artifacts: state.artifacts,
      summary: this.generateSummary(state, reason),
      state: {
        progress_percent: state.lastProgressPercent,
        errors: state.errors,
        reflections: state.reflections,
      },
    };
  }

  /**
   * Generate human-readable summary
   *
   * @param {Object} state - Current agent state
   * @param {string} reason - Reason for stopping
   * @returns {string} Summary text
   */
  generateSummary(state, reason) {
    const lastReflection = state.reflections && state.reflections.length > 0
      ? state.reflections[state.reflections.length - 1]
      : null;

    let summary = `# Autonomous Session Summary\n\n`;
    summary += `**Task**: ${state.task}\n`;
    summary += `**Status**: ${reason}\n`;
    summary += `**Iterations**: ${state.iteration} / ${this.maxIterations}\n`;
    summary += `**Progress**: ${state.lastProgressPercent}%\n`;
    summary += `**Confidence**: ${(state.confidence * 100).toFixed(0)}%\n\n`;

    if (state.artifacts && state.artifacts.length > 0) {
      summary += `## Artifacts Created (${state.artifacts.length})\n`;
      state.artifacts.forEach(a => {
        summary += `- ${a.type}: ${a.path}\n`;
      });
      summary += '\n';
    }

    if (state.history && state.history.length > 0) {
      summary += `## Actions Taken\n`;
      state.history.slice(-5).forEach(h => {
        summary += `**Iteration ${h.iteration}**: ${h.action}\n`;
        if (h.tools_used) {
          summary += `  Tools: ${h.tools_used.join(', ')}\n`;
        }
      });
      summary += '\n';
    }

    if (lastReflection) {
      summary += `## Final Assessment\n`;
      summary += lastReflection.reasoning + '\n';
    }

    return summary;
  }

  /**
   * Get progress summary for checkpoints
   *
   * @param {Object} state - Current agent state
   * @returns {Object} Progress summary
   */
  getProgressSummary(state) {
    return {
      iteration: state.iteration,
      max_iterations: this.maxIterations,
      progress_percent: state.lastProgressPercent,
      artifacts_created: state.artifacts ? state.artifacts.length : 0,
      errors: state.errors,
      stuck_count: state.noProgressCount,
      action_history: state.history, // Include iteration-by-iteration actions
      artifacts: state.artifacts, // Include created artifacts
      recentFailures: state.recentFailures || [], // Include recent failures for diagnostics
    };
  }

  /**
   * Build success patterns guidance for reflection
   *
   * @param {Array} successPatterns - Array of success pattern objects
   * @returns {string} Success patterns guidance
   */
  buildSuccessPatternsGuidance(successPatterns) {
    if (!successPatterns || successPatterns.length === 0) {
      return '';
    }

    let guidance = `\n## ✅ What Has Worked in This Session\n\n`;
    guidance += `The following approaches succeeded:\n\n`;

    successPatterns.forEach((pattern, idx) => {
      guidance += pattern.insight;
      if (idx < successPatterns.length - 1) {
        guidance += `\n`;
      }
    });

    guidance += `\n**LEARN FROM SUCCESS**: When facing similar situations, use these proven approaches.\n`;

    return guidance;
  }
}
