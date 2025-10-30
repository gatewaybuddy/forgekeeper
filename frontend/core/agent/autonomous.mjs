/**
 * Autonomous Agent - Self-Directed Task Completion
 *
 * Enables the agent to work autonomously on tasks through iterative
 * self-reflection and execution cycles.
 *
 * Flow:
 * 1. Reflect: Assess current state and progress
 * 2. Plan: Decide next action
 * 3. Execute: Use tools to perform action
 * 4. Assess: Evaluate results and decide to continue/complete
 */

import { ulid } from 'ulid';
import fs from 'fs/promises'; // [Day 10] For checkpoint save/load
import path from 'path';
import { contextLogEvents } from '../services/contextlog-events.mjs';
import { createSessionMemory } from './session-memory.mjs';
import { createEpisodicMemory } from './episodic-memory.mjs'; // [Phase 5 Option A]
import { createDiagnosticReflection } from './diagnostic-reflection.mjs'; // [T302] Root cause analysis
import { createRecoveryPlanner } from './recovery-planner.mjs'; // [T306] Recovery strategies

/**
 * @typedef {Object} AutonomousConfig
 * @property {Object} llmClient - LLM client for chat
 * @property {string} model - Model to use
 * @property {number} maxIterations - Max autonomous iterations (default: 15)
 * @property {number} checkpointInterval - Iterations between user checkpoints (default: 5)
 * @property {number} errorThreshold - Max errors before stopping (default: 3)
 * @property {string} playgroundRoot - Sandbox directory for agent work
 */

/**
 * @typedef {Object} ReflectionResult
 * @property {'continue'|'complete'|'stuck'} assessment - Agent's decision
 * @property {number} progress_percent - 0-100 completion estimate
 * @property {number} confidence - 0.0-1.0 confidence in assessment
 * @property {string} next_action - Description of next action
 * @property {string} reasoning - Explanation of decision
 * @property {Object} [tool_plan] - Specific tool calls planned
 */

/**
 * @typedef {Object} AutonomousResult
 * @property {boolean} completed - Whether task was completed
 * @property {string} reason - Why agent stopped
 * @property {number} iterations - Number of iterations taken
 * @property {number} confidence - Final confidence score
 * @property {Array} history - Iteration history
 * @property {string} summary - Human-readable summary
 * @property {Object} state - Final agent state
 */

export class AutonomousAgent {
  /**
   * @param {AutonomousConfig} config
   */
  constructor(config) {
    this.llmClient = config.llmClient;
    this.model = config.model || 'core';
    this.maxIterations = config.maxIterations || 15;
    this.checkpointInterval = config.checkpointInterval || 5;
    this.errorThreshold = config.errorThreshold || 3;
    this.playgroundRoot = config.playgroundRoot || '.forgekeeper/playground';
    this.interactiveMode = config.interactiveMode || false; // [Day 10] Ask for clarification when stuck
    this.preferenceSystem = config.preferenceSystem || null; // [Phase 5 Option D] User preferences

    this.state = null;
    this.sessionId = null;
    this.stopRequested = false;
    this.waitingForClarification = false; // [Day 10]
    this.clarifyingQuestions = null; // [Day 10]

    // Session memory for learning
    this.sessionMemory = createSessionMemory(this.playgroundRoot);
    this.pastLearnings = null;
    this.userPreferenceGuidance = null; // [Phase 5 Option D]

    // Episodic memory for semantic search [Phase 5 Option A]
    this.episodicMemory = createEpisodicMemory(this.playgroundRoot);
    this.relevantEpisodes = null;

    // Diagnostic reflection for root cause analysis [T302]
    this.diagnosticReflection = createDiagnosticReflection(this.llmClient, this.model, {
      whyDepth: 5,
      temperature: 0.2,
      maxTokens: 1024,
    });

    // Recovery planner for error recovery [T306]
    this.recoveryPlanner = createRecoveryPlanner();
  }

  /**
   * Run autonomous agent on a task
   *
   * @param {string} task - The task to complete
   * @param {Object} executor - Tool executor
   * @param {Object} context - Execution context (convId, turnId)
   * @returns {Promise<AutonomousResult>}
   */
  async run(task, executor, context) {
    this.sessionId = ulid();
    this.stopRequested = false;

    // Initialize state
    this.state = {
      task,
      iteration: 0,
      errors: 0,
      noProgressCount: 0,
      lastProgressPercent: 0,
      confidence: 0,
      taskComplete: false,
      history: [],
      artifacts: [], // Files created, commands run, etc.
      reflections: [], // All reflection results
      actionHistory: [], // Track action signatures to detect loops [Day 8]
      recentFailures: [], // Last 5 failures with context [Day 8]
      repetitiveActionDetected: false, // Flag for stuck detection [Day 8]
    };

    // Load past learnings for this task type (successes + failures) [Day 10]
    const taskType = this.detectTaskType(task);
    this.pastLearnings = await this.sessionMemory.getSuccessfulPatterns(taskType);
    this.pastFailures = await this.sessionMemory.getFailurePatterns(taskType);
    this.learningGuidance = await this.sessionMemory.getGuidance(taskType);

    if (this.pastLearnings.length > 0) {
      console.log(`[AutonomousAgent] Loaded ${this.pastLearnings.length} successful patterns for ${taskType} tasks`);
    }
    if (this.pastFailures.length > 0) {
      console.log(`[AutonomousAgent] Loaded ${this.pastFailures.length} failure patterns to avoid`);
    }

    // Load user preferences [Phase 5 Option D]
    if (this.preferenceSystem) {
      try {
        this.userPreferenceGuidance = await this.preferenceSystem.generatePreferenceGuidance();
        if (this.userPreferenceGuidance && this.userPreferenceGuidance.trim().length > 0) {
          console.log('[AutonomousAgent] Loaded user preferences');
        }
      } catch (err) {
        console.warn('[AutonomousAgent] Failed to load user preferences:', err);
      }
    }

    // Search for relevant episodes using semantic similarity [Phase 5 Option A]
    try {
      const similarEpisodes = await this.episodicMemory.searchSimilar(task, {
        limit: 3,
        minScore: 0.4,
        successOnly: true, // Only show successful examples
      });

      if (similarEpisodes.length > 0) {
        this.relevantEpisodes = similarEpisodes;
        console.log(`[AutonomousAgent] Found ${similarEpisodes.length} relevant episodes (scores: ${similarEpisodes.map(e => e.score.toFixed(2)).join(', ')})`);
      }
    } catch (err) {
      console.warn('[AutonomousAgent] Failed to search episodes:', err);
    }

    // Emit session start
    await contextLogEvents.emit({
      id: ulid(),
      type: 'autonomous_session_start',
      ts: new Date().toISOString(),
      conv_id: context.convId,
      turn_id: context.turnId,
      session_id: this.sessionId,
      task,
      max_iterations: this.maxIterations,
      actor: 'system',
      act: 'autonomous_start',
    });

    console.log(`[AutonomousAgent] Starting session ${this.sessionId}`);
    console.log(`[AutonomousAgent] Task: ${task}`);

    // Main autonomous loop
    while (true) {
      this.state.iteration++;

      console.log(`\n[AutonomousAgent] Iteration ${this.state.iteration}/${this.maxIterations}`);

      // Check if user requested stop
      if (this.stopRequested) {
        console.log('[AutonomousAgent] Stop requested by user');
        await this.complete('user_stop', context);
        return this.buildResult('user_stop');
      }

      // Check stopping criteria
      const stopCheck = this.shouldStop();

      // [Day 10] Interactive mode - ask for clarification instead of stopping
      if (stopCheck.needsClarification && !stopCheck.stop) {
        console.log(`[AutonomousAgent] Asking for clarification: ${stopCheck.reason}`);
        const questions = await this.generateClarifyingQuestions();
        const clarificationRequest = await this.askForClarification(questions);

        // Save checkpoint before waiting for response
        await this.saveCheckpoint();

        // Return clarification request (server will handle waiting for user input)
        return {
          ...this.buildResult(stopCheck.reason),
          needsClarification: true,
          questions: clarificationRequest.questions,
          currentState: clarificationRequest.currentState,
        };
      }

      if (stopCheck.stop) {
        console.log(`[AutonomousAgent] Stopping: ${stopCheck.reason}`);
        await this.complete(stopCheck.reason, context);
        return this.buildResult(stopCheck.reason);
      }

      // Checkpoint (emit progress for user monitoring) + auto-save [Day 10]
      if (this.state.iteration % this.checkpointInterval === 0) {
        await this.saveCheckpoint(); // Auto-save state
        await this.emitCheckpoint(context);
      }

      try {
        // Step 1: Self-Reflection
        console.log('[AutonomousAgent] Reflecting...');
        const reflection = await this.reflect(context);

        this.state.reflections.push(reflection);

        console.log(`[AutonomousAgent] Assessment: ${reflection.assessment}`);
        console.log(`[AutonomousAgent] Progress: ${reflection.progress_percent}%`);
        console.log(`[AutonomousAgent] Confidence: ${reflection.confidence}`);

        // Emit reflection event
        await contextLogEvents.emit({
          id: ulid(),
          type: 'autonomous_iteration',
          ts: new Date().toISOString(),
          conv_id: context.convId,
          turn_id: context.turnId,
          session_id: this.sessionId,
          iteration: this.state.iteration,
          actor: 'assistant',
          act: 'reflection',
          assessment: reflection.assessment,
          progress: reflection.progress_percent,
          confidence: reflection.confidence,
          next_action: reflection.next_action,
        });

        // Step 2: Handle assessment
        if (reflection.assessment === 'complete') {
          this.state.taskComplete = true;
          this.state.confidence = reflection.confidence;
          // Will stop on next loop iteration
          continue;
        }

        if (reflection.assessment === 'stuck') {
          this.state.noProgressCount++;
          console.log(`[AutonomousAgent] Agent reports being stuck (${this.state.noProgressCount}/3)`);
        } else {
          // Check if making actual progress
          if (reflection.progress_percent <= this.state.lastProgressPercent) {
            this.state.noProgressCount++;
          } else {
            this.state.noProgressCount = 0;
            this.state.lastProgressPercent = reflection.progress_percent;
          }
        }

        // Step 3: Execute next action
        console.log(`[AutonomousAgent] Executing: ${reflection.next_action}`);
        const executionResult = await this.executeIteration(
          reflection,
          executor,
          context
        );

        // Record history
        this.state.history.push({
          iteration: this.state.iteration,
          action: reflection.next_action,
          result: executionResult.summary,
          progress: reflection.progress_percent,
          confidence: reflection.confidence,
          tools_used: executionResult.tools_used,
          artifacts: executionResult.artifacts,
        });

        console.log(`[AutonomousAgent] Iteration complete. Tools used: ${executionResult.tools_used.join(', ')}`);

      } catch (error) {
        console.error('[AutonomousAgent] Iteration error:', error);
        this.state.errors++;

        await contextLogEvents.emitError(context.convId, context.turnId, error);

        // Record error in history
        this.state.history.push({
          iteration: this.state.iteration,
          action: 'error',
          result: error.message,
          error: true,
        });
      }
    }
  }

  /**
   * Self-reflection: Assess state and decide next action
   *
   * @param {Object} context
   * @returns {Promise<ReflectionResult>}
   */
  async reflect(context) {
    const reflectionPrompt = this.buildReflectionPrompt();

    try {
      const response = await this.llmClient.chat({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: REFLECTION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: reflectionPrompt,
          },
        ],
        temperature: 0.3, // Some creativity, but mostly deterministic
        max_tokens: 1500,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'reflection_result',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                assessment: {
                  type: 'string',
                  enum: ['continue', 'complete', 'stuck'],
                },
                progress_percent: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
                next_action: {
                  type: 'string',
                },
                reasoning: {
                  type: 'string',
                },
                tool_plan: {
                  type: 'object',
                  properties: {
                    tool: { type: 'string' },
                    purpose: { type: 'string' },
                  },
                  required: ['tool', 'purpose'],
                  additionalProperties: false,
                },
              },
              required: ['assessment', 'progress_percent', 'confidence', 'next_action', 'reasoning'],
              additionalProperties: false,
            },
          },
        },
      });

      const reflection = JSON.parse(response.choices[0].message.content);

      // Validate and sanitize
      return {
        assessment: reflection.assessment || 'continue',
        progress_percent: Math.max(0, Math.min(100, reflection.progress_percent || 0)),
        confidence: Math.max(0, Math.min(1, reflection.confidence || 0)),
        next_action: reflection.next_action || 'Continue working on task',
        reasoning: reflection.reasoning || '',
        tool_plan: reflection.tool_plan,
      };

    } catch (error) {
      console.error('[AutonomousAgent] Reflection failed:', error);

      // Fallback: continue with generic action
      return {
        assessment: 'continue',
        progress_percent: this.state.lastProgressPercent || 0,
        confidence: 0.3,
        next_action: 'Continue working on the task',
        reasoning: 'Failed to generate reflection, continuing with default action',
      };
    }
  }

  /**
   * Execute the current iteration based on reflection
   *
   * @param {ReflectionResult} reflection
   * @param {Object} executor
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async executeIteration(reflection, executor, context) {
    // Build execution plan from reflection
    const plan = this.planExecution(reflection);

    const toolsUsed = [];
    const artifacts = [];
    let summary = '';

    // Execute each step in the plan
    for (const step of plan.steps) {
      try {
        // [Day 8] Check for repetitive actions BEFORE executing
        const actionSignature = `${step.tool}:${JSON.stringify(step.args)}`;
        const recentCount = this.state.actionHistory.filter(sig => sig === actionSignature).length;

        if (recentCount >= 2) {
          console.warn(`[AutonomousAgent] Detected repetitive action: ${actionSignature} (attempted ${recentCount} times already)`);
          this.state.repetitiveActionDetected = true;

          summary += `⚠️  SKIPPED repetitive action: ${step.tool}(${JSON.stringify(step.args).slice(0, 50)}...) - already tried ${recentCount} times\n`;
          continue; // Skip this tool execution
        }

        console.log(`[AutonomousAgent] Tool: ${step.tool}(${JSON.stringify(step.args).slice(0, 100)}...)`);

        // Track action before execution
        this.state.actionHistory.push(actionSignature);

        // Execute tool
        const result = await executor.execute(
          {
            id: ulid(),
            type: 'function',
            function: {
              name: step.tool,
              arguments: typeof step.args === 'string' ? step.args : JSON.stringify(step.args),
            },
          },
          {
            ...context,
            cwd: this.playgroundRoot,
            sandboxRoot: this.playgroundRoot,
          }
        );

        // [T302] Check if tool execution failed
        if (result.error) {
          console.error(`[AutonomousAgent] Tool execution failed:`, result.error);
          summary += `${step.tool}: ERROR - ${result.error.message}\n`;

          // [T302] Run diagnostic reflection for root cause analysis
          const diagnosis = await this.runDiagnosticReflection(
            {
              function: {
                name: step.tool,
                arguments: step.args,
              },
            },
            result.error,
            executor,
            context
          );

          // [T306-T307] Generate and execute recovery plan
          let recoverySucceeded = false;

          if (diagnosis) {
            // Generate recovery plan
            const recoveryPlan = await this.recoveryPlanner.generateRecoveryPlan(diagnosis, {
              toolCall: {
                function: {
                  name: step.tool,
                  arguments: step.args,
                },
              },
              error: result.error,
              availableTools: executor.toolRegistry ? Array.from(executor.toolRegistry.keys()) : [],
              taskGoal: this.state.task,
            });

            // Try to execute recovery plan
            if (recoveryPlan.hasRecoveryPlan && recoveryPlan.primaryStrategy) {
              console.log(`[AutonomousAgent] Attempting recovery: ${recoveryPlan.primaryStrategy.name}`);
              summary += `\n🔧 RECOVERY ATTEMPT: ${recoveryPlan.primaryStrategy.description}\n`;

              // Execute recovery steps
              const recoveryResult = await this.executeRecoverySteps(
                recoveryPlan.primaryStrategy.steps,
                executor,
                context
              );

              if (recoveryResult.success) {
                recoverySucceeded = true;
                summary += `✅ RECOVERY SUCCESS: ${recoveryResult.summary}\n`;
                console.log('[AutonomousAgent] Recovery succeeded!');
              } else {
                summary += `❌ RECOVERY FAILED: ${recoveryResult.summary}\n`;
                console.warn('[AutonomousAgent] Recovery failed');
              }
            } else {
              summary += `⚠️  NO RECOVERY PLAN AVAILABLE\n`;
            }
          }

          // Track failure with diagnostic context and recovery outcome
          const failure = {
            tool: step.tool,
            args: step.args,
            error: result.error.message,
            iteration: this.state.iteration,
            diagnosis, // Include full diagnostic analysis
            recoveryAttempted: diagnosis ? true : false,
            recoverySucceeded,
          };

          this.state.recentFailures.push(failure);
          if (this.state.recentFailures.length > 5) {
            this.state.recentFailures.shift(); // Keep only last 5
          }

          // Add diagnosis summary to iteration summary
          if (diagnosis && diagnosis.rootCause) {
            summary += `\n🔍 DIAGNOSIS: ${diagnosis.rootCause.description}\n`;
            if (diagnosis.alternatives && diagnosis.alternatives.length > 0 && !recoverySucceeded) {
              summary += `💡 SUGGESTED: ${diagnosis.alternatives[0].description}\n`;
            }
          }

          // If recovery succeeded, we can continue to next step
          // If it failed, skip to next planned step
          if (!recoverySucceeded) {
            continue; // Skip to next step
          }
        }

        toolsUsed.push(step.tool);

        // Track artifacts
        if (step.tool === 'write_file') {
          artifacts.push({ type: 'file', path: step.args.path });
        }

        // Accumulate summary
        const resultPreview = result.content.length > 200
          ? result.content.slice(0, 200) + '...'
          : result.content;

        summary += `${step.tool}: ${resultPreview}\n`;

      } catch (error) {
        console.error(`[AutonomousAgent] Tool execution failed (unexpected):`, error);
        summary += `${step.tool}: ERROR - ${error.message}\n`;

        // Track unexpected failure (shouldn't normally happen)
        const failure = {
          tool: step.tool,
          args: step.args,
          error: error.message,
          iteration: this.state.iteration,
        };

        this.state.recentFailures.push(failure);
        if (this.state.recentFailures.length > 5) {
          this.state.recentFailures.shift(); // Keep only last 5
        }
      }
    }

    this.state.artifacts.push(...artifacts);

    return {
      summary: summary.trim(),
      tools_used: toolsUsed,
      artifacts,
    };
  }

  /**
   * Execute recovery plan steps
   * [T307] Attempts to recover from tool failure by executing recovery steps
   *
   * @param {Array} steps - Recovery steps from planner
   * @param {Object} executor - Tool executor
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Recovery result
   */
  async executeRecoverySteps(steps, executor, context) {
    let summary = '';
    let success = false;

    console.log(`[AutonomousAgent] Executing ${steps.length} recovery steps`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Skip null tool steps (e.g., ask_user)
      if (!step.tool) {
        summary += `Step ${i + 1}: ${step.action} (requires user interaction)\n`;
        continue;
      }

      try {
        console.log(`[AutonomousAgent] Recovery step ${i + 1}: ${step.tool}(${JSON.stringify(step.args).slice(0, 100)}...)`);

        // Execute recovery step
        const result = await executor.execute(
          {
            id: ulid(),
            type: 'function',
            function: {
              name: step.tool,
              arguments: typeof step.args === 'string' ? step.args : JSON.stringify(step.args),
            },
          },
          {
            ...context,
            cwd: this.playgroundRoot,
            sandboxRoot: this.playgroundRoot,
          }
        );

        // Check if recovery step succeeded
        if (result.error) {
          summary += `Step ${i + 1} FAILED: ${result.error.message}\n`;
          console.error(`[AutonomousAgent] Recovery step ${i + 1} failed:`, result.error);
          success = false;
          break; // Stop trying recovery if any step fails
        } else {
          const resultPreview = result.content.length > 100
            ? result.content.slice(0, 100) + '...'
            : result.content;
          summary += `Step ${i + 1} OK: ${resultPreview}\n`;
          success = true; // Mark as success if at least steps complete
        }
      } catch (error) {
        summary += `Step ${i + 1} ERROR: ${error.message}\n`;
        console.error(`[AutonomousAgent] Recovery step ${i + 1} threw:`, error);
        success = false;
        break;
      }
    }

    return {
      success,
      summary: summary.trim(),
      stepsCompleted: success ? steps.length : 0,
    };
  }

  /**
   * Plan tool execution based on reflection
   *
   * @param {ReflectionResult} reflection
   * @returns {Object}
   */
  planExecution(reflection) {
    // If reflection includes specific tool plan, use it
    if (reflection.tool_plan && reflection.tool_plan.tool) {
      return {
        steps: [
          {
            tool: reflection.tool_plan.tool,
            args: this.inferToolArgs(reflection.tool_plan.tool, reflection.next_action),
            purpose: reflection.tool_plan.purpose,
          },
        ],
      };
    }

    // Otherwise, infer from next_action description
    const steps = this.inferToolsFromAction(reflection.next_action);

    return { steps };
  }

  /**
   * Infer tool calls from action description
   *
   * Enhanced heuristic-based inference for common patterns including
   * research, multi-step, and documentation tasks
   *
   * @param {string} action
   * @returns {Array}
   */
  inferToolsFromAction(action) {
    const lower = action.toLowerCase();
    const steps = [];

    // [Day 9] Exploratory task - multi-tool search plan
    const taskType = this.detectTaskType(this.state.task);

    if (taskType === 'exploratory' && this.state.iteration <= 3) {
      // First 3 iterations: cast a wide net with multiple tools
      const keywords = this.extractKeywords(this.state.task);

      // Always start with directory exploration
      steps.push({
        tool: 'read_dir',
        args: { path: '.' },
        purpose: 'Explore root directory structure',
      });

      if (keywords.length > 0) {
        // Build find command with keywords
        const namePatterns = keywords.map(kw => `-name "*${kw}*"`).join(' -o ');
        steps.push({
          tool: 'run_bash',
          args: { command: `find . \\( ${namePatterns} \\) -type f 2>/dev/null | head -20` },
          purpose: `Find files matching keywords: ${keywords.join(', ')}`,
        });

        // Build grep command for content search
        const grepPattern = keywords.join('\\|');
        steps.push({
          tool: 'run_bash',
          args: { command: `grep -r -i "${grepPattern}" . --include="*.py" --include="*.js" --include="*.mjs" --include="*.md" --include="*.txt" 2>/dev/null | head -15` },
          purpose: `Search file contents for: ${keywords.join(', ')}`,
        });
      }

      return steps;
    }

    // Research/Analysis: Explore codebase
    if (lower.includes('explore') || lower.includes('analyze codebase') || lower.includes('examine structure')) {
      steps.push({
        tool: 'read_dir',
        args: { path: '.' },
        purpose: 'Explore directory structure',
      });
      return steps;
    }

    // Research: Find files matching pattern
    if (lower.includes('find all') || lower.includes('locate')) {
      const filePattern = this.extractFilePattern(action);
      if (filePattern) {
        steps.push({
          tool: 'run_bash',
          args: { command: `find . -name "${filePattern}" -type f | head -20` },
          purpose: 'Find files matching pattern',
        });
      } else {
        steps.push({
          tool: 'run_bash',
          args: { command: 'find . -type f -name "*.py" -o -name "*.js" -o -name "*.mjs" | head -20' },
          purpose: 'Find code files',
        });
      }
      return steps;
    }

    // Research: Search for content
    if (lower.includes('search for') || lower.includes('grep')) {
      const searchTerm = this.extractSearchTerm(action);
      if (searchTerm) {
        steps.push({
          tool: 'run_bash',
          args: { command: `grep -r "${searchTerm}" . --include="*.py" --include="*.js" --include="*.mjs" | head -20` },
          purpose: 'Search for pattern in code',
        });
      }
      return steps;
    }

    // Documentation: Read multiple files
    if (lower.includes('read') && (lower.includes('all') || lower.includes('multiple'))) {
      // Will need to be followed up with specific file reads
      steps.push({
        tool: 'read_dir',
        args: { path: '.' },
        purpose: 'List files to read',
      });
      return steps;
    }

    // File operations: Create
    if (lower.includes('create') && (lower.includes('file') || lower.includes('.py') || lower.includes('.js') || lower.includes('.md'))) {
      const match = action.match(/create\s+(\S+\.\w+)/i);
      if (match) {
        const fileName = match[1];
        const content = this.generateInitialContent(fileName);
        steps.push({
          tool: 'write_file',
          args: { path: fileName, content },
          purpose: 'Create file',
        });
      }
      return steps;
    }

    // File operations: Write/Update
    if (lower.includes('write') || lower.includes('update')) {
      const match = action.match(/(?:write|update)\s+(\S+\.\w+)/i);
      if (match) {
        steps.push({
          tool: 'write_file',
          args: { path: match[1], content: '# Content to be added\n' },
          purpose: 'Write to file',
        });
      }
      return steps;
    }

    // File operations: Read specific file
    if (lower.includes('read')) {
      const match = action.match(/read\s+(\S+\.\w+)/i) || action.match(/read\s+file\s+(\S+)/i);
      if (match) {
        steps.push({
          tool: 'read_file',
          args: { path: match[1] },
          purpose: 'Read file',
        });
        return steps;
      }
    }

    // Directory operations
    if (lower.includes('list') || lower.includes('directory') || lower.includes('ls ')) {
      const pathMatch = action.match(/(?:list|directory|ls)\s+(\S+)/i);
      const path = pathMatch ? pathMatch[1] : '.';
      steps.push({
        tool: 'read_dir',
        args: { path },
        purpose: 'List directory',
      });
      return steps;
    }

    // Testing: Run tests
    if (lower.includes('test') && (lower.includes('run') || lower.includes('execute'))) {
      const testCmd = this.inferTestCommand(action);
      steps.push({
        tool: 'run_bash',
        args: { command: testCmd },
        purpose: 'Run tests',
      });
      return steps;
    }

    // Shell commands: Generic execution
    if (lower.includes('run') || lower.includes('execute')) {
      const match = action.match(/(?:run|execute)\s+(.+)/i);
      if (match) {
        steps.push({
          tool: 'run_bash',
          args: { command: match[1].trim() },
          purpose: 'Execute command',
        });
      }
      return steps;
    }

    // Documentation: Create README
    if (lower.includes('readme') || lower.includes('documentation')) {
      steps.push({
        tool: 'write_file',
        args: {
          path: 'README.md',
          content: '# Documentation\n\n## Overview\n\n(To be completed)\n'
        },
        purpose: 'Create documentation',
      });
      return steps;
    }

    // Default: use get_time as a no-op (agent needs more info)
    steps.push({
      tool: 'get_time',
      args: {},
      purpose: 'Get current time (no specific action inferred)',
    });

    return steps;
  }

  /**
   * Extract file pattern from action description
   *
   * @param {string} action
   * @returns {string|null}
   */
  extractFilePattern(action) {
    const patterns = [
      /find\s+all\s+(\S+\.\w+)/i,
      /locate\s+(\S+\.\w+)/i,
      /files?\s+matching\s+['"]*([^'"]+)['"]/i,
    ];

    for (const pattern of patterns) {
      const match = action.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Extract search term from action description
   *
   * @param {string} action
   * @returns {string|null}
   */
  extractSearchTerm(action) {
    const patterns = [
      /search\s+for\s+['"]*([^'"]+)['"]/i,
      /grep\s+['"]*([^'"]+)['"]/i,
      /find.*containing\s+['"]*([^'"]+)['"]/i,
    ];

    for (const pattern of patterns) {
      const match = action.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Generate initial file content based on filename
   *
   * @param {string} filename
   * @returns {string}
   */
  generateInitialContent(filename) {
    const ext = filename.split('.').pop();

    switch (ext) {
      case 'py':
        return '#!/usr/bin/env python3\n"""TODO: Add docstring"""\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n';

      case 'js':
      case 'mjs':
        return '/**\n * TODO: Add description\n */\n\nfunction main() {\n  // TODO: Implement\n}\n\nif (require.main === module) {\n  main();\n}\n';

      case 'md':
        return `# ${filename.replace('.md', '')}\n\n## Overview\n\n(To be completed)\n`;

      case 'txt':
        return '';

      default:
        return '# TODO: Implement\n';
    }
  }

  /**
   * Infer test command from action/context
   *
   * @param {string} action
   * @returns {string}
   */
  inferTestCommand(action) {
    const lower = action.toLowerCase();

    if (lower.includes('pytest')) {
      return 'pytest -v';
    }

    if (lower.includes('npm test') || lower.includes('jest')) {
      return 'npm test';
    }

    if (lower.includes('python')) {
      const match = action.match(/test[_-](\w+)\.py/i);
      if (match) {
        return `python test_${match[1]}.py`;
      }
      return 'python -m pytest';
    }

    // Default Python test
    return 'python -m pytest -v';
  }

  /**
   * Infer tool arguments from context
   *
   * @param {string} tool
   * @param {string} context
   * @returns {Object}
   */
  inferToolArgs(tool, context) {
    // Simple arg inference
    // In production, this would be more sophisticated
    switch (tool) {
      case 'write_file':
        return { path: 'output.txt', content: context };
      case 'read_file':
        return { path: 'input.txt' };
      case 'read_dir':
        return { path: '.' };
      case 'run_bash':
        return { command: 'echo "TODO"' };
      default:
        return {};
    }
  }

  /**
   * Extract meaningful keywords from task description
   * [Day 9]
   *
   * @param {string} task
   * @returns {Array<string>}
   */
  extractKeywords(task) {
    const lower = task.toLowerCase();
    const keywords = [];

    // Extract quoted terms (highest priority)
    const quotedMatches = task.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach(match => {
        keywords.push(match.replace(/"/g, ''));
      });
    }

    // Extract technology/domain terms
    const techTerms = [
      'search', 'website', 'web', 'http', 'api', 'tool', 'crawler', 'scrape',
      'database', 'db', 'sql', 'server', 'client', 'auth', 'test', 'config',
      'setup', 'install', 'deploy', 'docker', 'kubernetes', 'service',
      'function', 'class', 'method', 'module', 'package', 'file', 'directory',
    ];

    techTerms.forEach(term => {
      if (lower.includes(term) && !keywords.includes(term)) {
        keywords.push(term);
      }
    });

    // Extract words that look like file patterns or specific nouns
    const words = task.split(/\s+/);
    words.forEach(word => {
      const cleaned = word.toLowerCase().replace(/[^a-z0-9_\-\.]/g, '');
      if (cleaned.length >= 4 && !keywords.includes(cleaned)) {
        // Check if it looks like a filename or specific term
        if (cleaned.includes('.') || cleaned.includes('_') || cleaned.includes('-')) {
          keywords.push(cleaned);
        }
      }
    });

    return keywords.slice(0, 5); // Limit to 5 most relevant keywords
  }

  /**
   * Run diagnostic reflection on a tool failure
   * [T302] Analyzes failures using "5 Whys" root cause analysis
   *
   * @param {Object} toolCall - The failed tool call
   * @param {Error} error - The error object
   * @param {Object} executor - Tool executor (for getting available tools)
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Diagnosis object
   */
  async runDiagnosticReflection(toolCall, error, executor, context) {
    try {
      // Get list of available tools
      const availableTools = executor.toolRegistry
        ? Array.from(executor.toolRegistry.keys())
        : [];

      // Get last 3 actions for context
      const previousActions = this.state.history.slice(-3).map(h => ({
        tool: h.tools_used?.[0] || 'unknown',
        args: {},
        result: h.result || '',
        success: !h.result.includes('ERROR'),
      }));

      // Build failure context
      const failureContext = {
        toolCall,
        error: {
          message: error.message,
          code: error.code,
          stdout: error.stdout,
          stderr: error.stderr,
          signal: error.signal,
        },
        iteration: this.state.iteration,
        previousActions,
        availableTools,
        workspaceState: {
          files: [], // TODO: Could read actual workspace state if needed
          directories: [],
        },
        taskGoal: this.state.task,
      };

      // Run diagnostic reflection
      const diagnosis = await this.diagnosticReflection.runDiagnosticReflection(failureContext);

      // Emit diagnostic event to ContextLog
      await contextLogEvents.emitDiagnosticReflection(
        context.convId,
        context.turnId,
        this.state.iteration,
        toolCall.function.name,
        diagnosis
      );

      return diagnosis;
    } catch (diagError) {
      console.error('[AutonomousAgent] Diagnostic reflection failed:', diagError);
      return null; // Graceful fallback - continue without diagnosis
    }
  }

  /**
   * Build reflection prompt from current state
   *
   * @returns {string}
   */
  buildReflectionPrompt() {
    const historyText = this.state.history.length > 0
      ? this.state.history.slice(-5).map((h, i) => {
          const iter = h.iteration;
          return `Iteration ${iter}: ${h.action}\n  Result: ${h.result.slice(0, 200)}${h.result.length > 200 ? '...' : ''}`;
        }).join('\n\n')
      : '(No iterations yet)';

    const artifactsText = this.state.artifacts.length > 0
      ? this.state.artifacts.map(a => `- ${a.type}: ${a.path}`).join('\n')
      : '(No artifacts created yet)';

    // Detect task type for specialized guidance
    const taskType = this.detectTaskType(this.state.task);
    const taskGuidance = this.getTaskTypeGuidance(taskType);

    // [Day 10] Add comprehensive learnings (successes + historical failures)
    const learningsText = this.learningGuidance && this.learningGuidance.trim().length > 0
      ? `\n## Past Session Learnings\n${this.learningGuidance}\n`
      : '';

    // [Phase 5 Option D] Add user preferences guidance
    const preferencesText = this.userPreferenceGuidance && this.userPreferenceGuidance.trim().length > 0
      ? `\n${this.userPreferenceGuidance}\n`
      : '';

    // [Phase 5 Option A] Add relevant episodes from semantic search
    const episodesText = this.buildEpisodesGuidance();

    return `# Autonomous Task - Self-Assessment

## Original Task
${this.state.task}

## Task Type Detected: ${taskType}
${taskGuidance}

${learningsText}${preferencesText}${episodesText}
${this.buildFailureWarnings()}
${this.buildRepetitionWarning()}

## Current State
- **Iteration**: ${this.state.iteration} / ${this.maxIterations}
- **Previous Progress**: ${this.state.lastProgressPercent}%
- **Artifacts Created**: ${this.state.artifacts.length}
- **Errors Encountered**: ${this.state.errors}

## What You've Done So Far
${historyText}

## Artifacts Created
${artifactsText}

## Reflection Questions

Please reflect on your progress and respond in JSON format:

1. **What concrete progress have I made?** (Be specific about files created, tests passed, code analyzed, etc.)
2. **What remains to be done to complete the task?** (Break into sub-tasks if multi-step)
3. **What is my next specific action?** (Name exact files, commands, or tools to use)
4. **Am I making progress or am I stuck?** (Consider: Am I repeating actions? Have I learned something new?)
5. **Task completion estimate**: ___%
6. **Confidence in my assessment**: 0.0 - 1.0

## Decision Strategy

**For Multi-Step Tasks**: Break the task into phases. Complete one phase before moving to the next.
**For Research Tasks**: Gather information systematically. Use read_dir to explore, read_file to analyze.
**For Code Generation**: Write, test, verify. Don't claim complete until tests pass.
**For Self-Improvement**: Reflect on what patterns work. Learn from failures.

Based on the above:
- **CONTINUE**: If there's more work to do and I know the next step
- **COMPLETE**: If the task is finished with high confidence (>0.9)
- **STUCK**: If I don't know what to do next or have tried the same thing multiple times

Respond with JSON only:
\`\`\`json
{
  "assessment": "continue|complete|stuck",
  "progress_percent": 0-100,
  "confidence": 0.0-1.0,
  "next_action": "Specific description of next action",
  "reasoning": "Why I chose this assessment and action",
  "tool_plan": {
    "tool": "tool_name",
    "purpose": "why I need this tool"
  }
}
\`\`\``;
  }

  /**
   * Build failure warnings section for reflection prompt
   * [Day 8]
   *
   * @returns {string}
   */
  buildFailureWarnings() {
    if (this.state.recentFailures.length === 0) return '';

    let warnings = `\n## ⚠️  Recent Failures - DO NOT REPEAT\n\n`;
    warnings += `The following actions FAILED recently. You MUST try a DIFFERENT approach:\n\n`;

    this.state.recentFailures.forEach((failure, idx) => {
      warnings += `${idx + 1}. **${failure.tool}** with args \`${JSON.stringify(failure.args).slice(0, 60)}...\`\n`;
      warnings += `   Error: ${failure.error}\n`;

      // [T302] Include diagnostic analysis if available
      if (failure.diagnosis && failure.diagnosis.rootCause) {
        warnings += `\n   🔍 **Root Cause Analysis**:\n`;
        warnings += `   - Category: ${failure.diagnosis.rootCause.category}\n`;
        warnings += `   - Issue: ${failure.diagnosis.rootCause.description}\n`;

        // Show why-chain (condensed)
        if (failure.diagnosis.whyChain) {
          warnings += `   - Why it failed: ${failure.diagnosis.whyChain.why1}\n`;
          warnings += `   - Underlying cause: ${failure.diagnosis.whyChain.why5}\n`;
        }

        // Show recovery strategies
        if (failure.diagnosis.alternatives && failure.diagnosis.alternatives.length > 0) {
          warnings += `\n   💡 **Recommended Recovery Strategies** (in priority order):\n`;
          failure.diagnosis.alternatives.slice(0, 3).forEach((alt, altIdx) => {
            warnings += `   ${altIdx + 1}. ${alt.strategy}: ${alt.description}\n`;
            if (alt.tools && alt.tools.length > 0) {
              warnings += `      Tools to use: ${alt.tools.join(', ')}\n`;
            }
          });
        }
      } else {
        // Fallback to heuristic suggestions if no diagnosis
        warnings += `   → **Try alternative**: `;

        if (failure.tool === 'read_file') {
          warnings += `Use 'find' or 'grep' to search instead, or 'read_dir' to list files first\n`;
        } else if (failure.tool === 'run_bash' && failure.error.includes('not found')) {
          warnings += `Check if path exists with 'read_dir', or use different search pattern\n`;
        } else if (failure.tool === 'run_bash') {
          warnings += `Verify command syntax, check for typos, or try a simpler command\n`;
        } else {
          warnings += `Try a broader approach or use a different tool\n`;
        }
      }
      warnings += `\n`;
    });

    warnings += `**IMPORTANT**: If you see yourself about to repeat any of the above, STOP and choose a completely different strategy.\n`;
    warnings += `**SUCCESS PATTERN**: When one approach fails, the ROOT CAUSE analysis above shows WHY it failed and WHAT to try instead.\n`;

    return warnings;
  }

  /**
   * Build repetition warning section for reflection prompt
   * [Day 8]
   *
   * @returns {string}
   */
  buildRepetitionWarning() {
    if (!this.state.repetitiveActionDetected) return '';

    return `\n## 🔁 REPETITION DETECTED\n\n` +
      `You have been trying the same action multiple times without success.\n` +
      `This is a clear sign you are STUCK.\n\n` +
      `Choose ONE:\n` +
      `1. Try a COMPLETELY DIFFERENT approach (recommended)\n` +
      `2. Assess as "stuck" if you cannot think of alternatives\n\n`;
  }

  /**
   * Build relevant episodes guidance for reflection prompt
   * [Phase 5 Option A]
   *
   * @returns {string}
   */
  buildEpisodesGuidance() {
    if (!this.relevantEpisodes || this.relevantEpisodes.length === 0) return '';

    let guidance = `\n## 📚 Relevant Past Episodes (Semantic Search)\n\n`;
    guidance += `Found ${this.relevantEpisodes.length} similar successful session(s):\n\n`;

    for (const { episode, score } of this.relevantEpisodes) {
      guidance += `### Episode (similarity: ${(score * 100).toFixed(0)}%)\n`;
      guidance += `**Task**: ${episode.task.slice(0, 100)}${episode.task.length > 100 ? '...' : ''}\n`;
      guidance += `**Strategy**: ${episode.strategy || 'N/A'}\n`;
      guidance += `**Tools Used**: ${episode.tools_used.join(', ')}\n`;
      guidance += `**Iterations**: ${episode.iterations}\n`;

      if (episode.summary) {
        guidance += `**Summary**: ${episode.summary.slice(0, 150)}${episode.summary.length > 150 ? '...' : ''}\n`;
      }

      guidance += `\n`;
    }

    guidance += `**How to use**: These episodes show what worked for similar tasks. ` +
      `Consider using similar strategies, tools, or approaches.\n\n`;

    return guidance;
  }

  /**
   * Format past learnings for reflection prompt
   *
   * @param {Array} learnings
   * @returns {string}
   */
  formatPastLearnings(learnings) {
    if (learnings.length === 0) return '';

    const toolCounts = {};
    learnings.forEach(l => {
      l.tools_used.forEach(tool => {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      });
    });

    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool]) => tool);

    const avgIterations = Math.round(
      learnings.reduce((sum, l) => sum + l.iterations, 0) / learnings.length
    );

    return `## Past Learnings (${learnings.length} successful sessions)
- **Effective tools**: ${topTools.join(', ')}
- **Typical iterations needed**: ~${avgIterations}
- **Success strategies**: ${learnings[0].strategy}

Use these learnings to inform your approach.
`;
  }

  /**
   * Detect task type for specialized handling
   *
   * @param {string} task
   * @returns {string}
   */
  detectTaskType(task) {
    const lower = task.toLowerCase();

    // [Day 9] Exploratory/uncertain tasks (check FIRST - highest priority for vague tasks)
    const exploratoryPatterns = [
      /see\s+if/i,
      /check\s+(whether|if)/i,
      /find\s+out/i,
      /look\s+(for|in)/i,
      /do\s+you\s+have/i,
      /are\s+there/i,
      /locate/i,
      /search\s+for/i,
    ];

    if (exploratoryPatterns.some(pattern => pattern.test(task))) {
      return 'exploratory';
    }

    // Check documentation first (more specific than research)
    if (lower.includes('readme') || lower.includes('documentation') || lower.includes('docs')) {
      return 'documentation';
    }

    // Research tasks
    if (lower.includes('analyze') || lower.includes('research') || lower.includes('find') || lower.includes('document')) {
      return 'research';
    }

    // Multi-step with tests
    if (lower.includes('test') && (lower.includes('create') || lower.includes('write'))) {
      return 'multi-step';
    }

    // Self-improvement
    if (lower.includes('refactor') || lower.includes('improve') || lower.includes('optimize')) {
      return 'self-improvement';
    }

    // Multi-step indicators
    if (lower.includes('multiple') || lower.includes('several') || lower.match(/\d+\s+(files|functions|tests)/)) {
      return 'multi-step';
    }

    return 'simple';
  }

  /**
   * Get guidance for specific task types
   *
   * @param {string} taskType
   * @returns {string}
   */
  getTaskTypeGuidance(taskType) {
    switch (taskType) {
      case 'exploratory':
        return `**Exploratory Search Guidance**:
1. Start VERY broad - explore directory structure with read_dir
2. Use find and grep to search by keywords from the task
3. Review search results and identify promising matches
4. Read specific files that look relevant
5. Synthesize findings - what did you discover?

⚠️  DO NOT get stuck on a single file - if it doesn't exist, move on immediately
⚠️  Use MULTIPLE tools in parallel (find + grep together)
⚠️  Broaden search if initial keywords yield nothing`;

      case 'research':
        return `**Research Task Guidance**:
1. Start with read_dir to explore directory structure
2. Use read_file to examine relevant files
3. Look for patterns across multiple files
4. Summarize findings systematically`;

      case 'multi-step':
        return `**Multi-Step Task Guidance**:
1. Break task into sequential phases (design → implement → test → verify)
2. Complete one phase fully before moving to next
3. Track dependencies between steps
4. Don't skip verification steps`;

      case 'self-improvement':
        return `**Self-Improvement Task Guidance**:
1. Analyze current code/memory patterns
2. Identify specific improvements needed
3. Make incremental changes
4. Verify improvements work before proceeding`;

      case 'documentation':
        return `**Documentation Task Guidance**:
1. Explore codebase structure first
2. Read key files to understand purpose
3. Identify main components and their relationships
4. Write clear, structured documentation`;

      default:
        return `**General Task Guidance**:
1. Make one focused change at a time
2. Verify each change works
3. Build incrementally toward goal`;
    }
  }

  /**
   * Check if agent should stop
   *
   * @returns {Object}
   */
  shouldStop() {
    // Hard limits
    if (this.state.iteration >= this.maxIterations) {
      return { stop: true, reason: 'max_iterations' };
    }

    if (this.state.errors >= this.errorThreshold) {
      return { stop: true, reason: 'too_many_errors' };
    }

    // Self-assessment: Task complete
    if (this.state.taskComplete && this.state.confidence >= 0.9) {
      return {
        stop: true,
        reason: 'task_complete',
        confidence: this.state.confidence,
      };
    }

    // [Day 8 + Day 10] Repetitive action detection - with interactive mode option
    if (this.state.repetitiveActionDetected) {
      if (this.interactiveMode && !this.waitingForClarification) {
        return { stop: false, needsClarification: true, reason: 'repetitive_actions' };
      }
      return { stop: true, reason: 'repetitive_actions' };
    }

    // [Day 8 + Day 10] Stuck loop detection - with interactive mode option
    if (this.state.actionHistory.length >= 3) {
      const last3 = this.state.actionHistory.slice(-3);
      const uniqueLast3 = new Set(last3);
      if (uniqueLast3.size === 1) {
        // Same exact action 3 times consecutively
        if (this.interactiveMode && !this.waitingForClarification) {
          return { stop: false, needsClarification: true, reason: 'stuck_loop' };
        }
        return { stop: true, reason: 'stuck_loop' };
      }
    }

    // [Day 10] Stuck detection (no progress) - with interactive mode option
    if (this.state.noProgressCount >= 3) {
      console.log(`[AutonomousAgent] No progress detected. InteractiveMode: ${this.interactiveMode}, Waiting: ${this.waitingForClarification}`);
      if (this.interactiveMode && !this.waitingForClarification) {
        console.log(`[AutonomousAgent] Requesting clarification for no_progress`);
        return { stop: false, needsClarification: true, reason: 'no_progress' };
      }
      return { stop: true, reason: 'no_progress' };
    }

    return { stop: false };
  }

  /**
   * Emit checkpoint event
   *
   * @param {Object} context
   */
  async emitCheckpoint(context) {
    console.log(`[AutonomousAgent] Checkpoint at iteration ${this.state.iteration}`);

    await contextLogEvents.emit({
      id: ulid(),
      type: 'autonomous_checkpoint',
      ts: new Date().toISOString(),
      conv_id: context.convId,
      turn_id: context.turnId,
      session_id: this.sessionId,
      iteration: this.state.iteration,
      actor: 'system',
      act: 'checkpoint',
      progress: this.getProgressSummary(),
    });
  }

  /**
   * Complete autonomous session
   *
   * @param {string} reason
   * @param {Object} context
   */
  async complete(reason, context) {
    const summary = this.generateSummary(reason);

    // Record session to memory for learning
    const taskType = this.detectTaskType(this.state.task);
    const toolsUsed = [...new Set(this.state.history.flatMap(h => h.tools_used || []))];

    // [Day 10] Enhanced session recording with failure details
    await this.sessionMemory.recordSession({
      task_type: taskType,
      success: reason === 'task_complete',
      iterations: this.state.iteration,
      tools_used: toolsUsed,
      strategy: this.generateStrategyDescription(),
      confidence: this.state.confidence,
      task: this.state.task,
      failure_reason: reason !== 'task_complete' ? reason : null,
      failed_tools: this.state.recentFailures.map(f => f.tool),
      repetitive_actions: this.state.repetitiveActionDetected,
      error_count: this.state.errors,
    });

    // [Phase 5 Option A] Record episode to episodic memory for semantic search
    await this.episodicMemory.recordEpisode({
      task: this.state.task,
      task_type: taskType,
      completed: reason === 'task_complete',
      iterations: this.state.iteration,
      tools_used: toolsUsed,
      strategy: this.generateStrategyDescription(),
      history: this.state.history,
      artifacts: this.state.artifacts,
      summary,
      confidence: this.state.confidence,
      failure_reason: reason !== 'task_complete' ? reason : null,
      error_count: this.state.errors,
    });

    await contextLogEvents.emit({
      id: ulid(),
      type: 'autonomous_session_complete',
      ts: new Date().toISOString(),
      conv_id: context.convId,
      turn_id: context.turnId,
      session_id: this.sessionId,
      actor: 'system',
      act: 'autonomous_complete',
      reason,
      iterations: this.state.iteration,
      confidence: this.state.confidence,
      summary,
    });

    console.log(`[AutonomousAgent] Session complete: ${reason}`);
    console.log(summary);
  }

  /**
   * Generate description of strategy used
   *
   * @returns {string}
   */
  generateStrategyDescription() {
    if (this.state.history.length === 0) {
      return 'No actions taken';
    }

    const actions = this.state.history.slice(0, 3).map(h => h.action).join(' → ');
    return `Started with: ${actions}`;
  }

  /**
   * Get progress summary for checkpoints
   *
   * @returns {Object}
   */
  getProgressSummary() {
    return {
      iteration: this.state.iteration,
      max_iterations: this.maxIterations,
      progress_percent: this.state.lastProgressPercent,
      artifacts_created: this.state.artifacts.length,
      errors: this.state.errors,
      stuck_count: this.state.noProgressCount,
      action_history: this.state.history, // Include iteration-by-iteration actions
      artifacts: this.state.artifacts, // Include created artifacts
    };
  }

  /**
   * Generate human-readable summary
   *
   * @param {string} reason
   * @returns {string}
   */
  generateSummary(reason) {
    const lastReflection = this.state.reflections[this.state.reflections.length - 1];

    let summary = `# Autonomous Session Summary\n\n`;
    summary += `**Task**: ${this.state.task}\n`;
    summary += `**Status**: ${reason}\n`;
    summary += `**Iterations**: ${this.state.iteration} / ${this.maxIterations}\n`;
    summary += `**Progress**: ${this.state.lastProgressPercent}%\n`;
    summary += `**Confidence**: ${(this.state.confidence * 100).toFixed(0)}%\n\n`;

    if (this.state.artifacts.length > 0) {
      summary += `## Artifacts Created (${this.state.artifacts.length})\n`;
      this.state.artifacts.forEach(a => {
        summary += `- ${a.type}: ${a.path}\n`;
      });
      summary += '\n';
    }

    if (this.state.history.length > 0) {
      summary += `## Actions Taken\n`;
      this.state.history.slice(-5).forEach(h => {
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
   * Build final result object
   *
   * @param {string} reason
   * @returns {AutonomousResult}
   */
  buildResult(reason) {
    return {
      completed: reason === 'task_complete',
      reason,
      iterations: this.state.iteration,
      confidence: this.state.confidence,
      history: this.state.history,
      artifacts: this.state.artifacts,
      summary: this.generateSummary(reason),
      state: {
        progress_percent: this.state.lastProgressPercent,
        errors: this.state.errors,
        reflections: this.state.reflections,
      },
    };
  }

  /**
   * Save checkpoint to resume later
   * [Day 10]
   *
   * @param {string} checkpointId - Optional checkpoint ID (defaults to sessionId)
   * @returns {Promise<string>} Path to checkpoint file
   */
  async saveCheckpoint(checkpointId = null) {
    const id = checkpointId || this.sessionId;
    const checkpointPath = path.join(this.playgroundRoot, `.checkpoint_${id}.json`);

    const checkpoint = {
      version: '1.0',
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      task: this.state.task,
      state: {
        iteration: this.state.iteration,
        errors: this.state.errors,
        noProgressCount: this.state.noProgressCount,
        lastProgressPercent: this.state.lastProgressPercent,
        confidence: this.state.confidence,
        taskComplete: this.state.taskComplete,
        history: this.state.history,
        artifacts: this.state.artifacts,
        reflections: this.state.reflections,
        actionHistory: this.state.actionHistory,
        recentFailures: this.state.recentFailures,
        repetitiveActionDetected: this.state.repetitiveActionDetected,
      },
      config: {
        maxIterations: this.maxIterations,
        checkpointInterval: this.checkpointInterval,
        errorThreshold: this.errorThreshold,
        model: this.model,
      },
    };

    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
    console.log(`[AutonomousAgent] Checkpoint saved: ${checkpointPath}`);

    return checkpointPath;
  }

  /**
   * Load checkpoint to resume session
   * [Day 10]
   *
   * @param {string} checkpointId - Checkpoint ID or session ID
   * @returns {Promise<Object>} Loaded checkpoint data
   */
  async loadCheckpoint(checkpointId) {
    const checkpointPath = path.join(this.playgroundRoot, `.checkpoint_${checkpointId}.json`);

    try {
      const content = await fs.readFile(checkpointPath, 'utf8');
      const checkpoint = JSON.parse(content);

      console.log(`[AutonomousAgent] Checkpoint loaded: ${checkpointPath}`);
      console.log(`[AutonomousAgent] Resume from iteration ${checkpoint.state.iteration}`);

      return checkpoint;
    } catch (error) {
      console.error(`[AutonomousAgent] Failed to load checkpoint:`, error);
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
  }

  /**
   * Resume from checkpoint
   * [Day 10]
   *
   * @param {string} checkpointId - Checkpoint ID to resume from
   * @param {Object} executor - Tool executor
   * @param {Object} context - Execution context
   * @returns {Promise<AutonomousResult>}
   */
  async resumeFromCheckpoint(checkpointId, executor, context) {
    const checkpoint = await this.loadCheckpoint(checkpointId);

    // Restore session ID and state
    this.sessionId = checkpoint.sessionId;
    this.state = checkpoint.state;
    this.maxIterations = checkpoint.config.maxIterations;
    this.model = checkpoint.config.model;

    // Reload learnings
    const taskType = this.detectTaskType(checkpoint.task);
    this.pastLearnings = await this.sessionMemory.getSuccessfulPatterns(taskType);
    this.pastFailures = await this.sessionMemory.getFailurePatterns(taskType);
    this.learningGuidance = await this.sessionMemory.getGuidance(taskType);

    console.log(`[AutonomousAgent] Resuming session ${this.sessionId} from iteration ${this.state.iteration}`);

    // Emit resume event
    await contextLogEvents.emit({
      id: ulid(),
      type: 'autonomous_session_resume',
      ts: new Date().toISOString(),
      conv_id: context.convId,
      turn_id: context.turnId,
      session_id: this.sessionId,
      actor: 'system',
      act: 'autonomous_resume',
      from_iteration: this.state.iteration,
    });

    // Continue from where we left off
    // The main loop will continue from current iteration
    while (true) {
      this.state.iteration++;

      // Check stopping criteria
      const stopCheck = this.shouldStop();
      if (stopCheck.stop) {
        await this.emitComplete(stopCheck.reason, context);
        return this.buildResult(stopCheck.reason);
      }

      // Check if stop requested
      if (this.stopRequested) {
        await this.saveCheckpoint(); // Auto-save before stopping
        return this.buildResult('user_stop');
      }

      // Checkpoint interval - auto-save
      if (this.state.iteration % this.checkpointInterval === 0) {
        await this.saveCheckpoint();
        await this.emitCheckpoint(context);
      }

      // Reflection and execution (same as run() method)
      try {
        const reflection = await this.reflect(context);
        this.state.reflections.push(reflection);

        if (reflection.assessment === 'complete') {
          this.state.taskComplete = true;
          this.state.confidence = reflection.confidence;
          continue;
        }

        if (reflection.assessment === 'stuck') {
          this.state.noProgressCount++;
        } else {
          if (reflection.progress_percent === this.state.lastProgressPercent) {
            this.state.noProgressCount++;
          } else {
            this.state.noProgressCount = 0;
            this.state.lastProgressPercent = reflection.progress_percent;
          }
        }

        const executionResult = await this.executeIteration(
          reflection,
          executor,
          context
        );

        this.state.history.push({
          iteration: this.state.iteration,
          action: reflection.next_action,
          result: executionResult.summary,
          progress: reflection.progress_percent,
          confidence: reflection.confidence,
          tools_used: executionResult.tools_used,
          artifacts: executionResult.artifacts,
        });

      } catch (error) {
        console.error('[AutonomousAgent] Iteration error:', error);
        this.state.errors++;
        await contextLogEvents.emitError(context.convId, context.turnId, error);
        this.state.history.push({
          iteration: this.state.iteration,
          action: 'error',
          result: error.message,
          error: true,
        });
      }
    }
  }

  /**
   * Generate clarifying questions when stuck
   * [Day 10]
   *
   * @returns {Promise<Array<string>>} List of clarifying questions
   */
  async generateClarifyingQuestions() {
    const taskType = this.detectTaskType(this.state.task);
    const lastActions = this.state.history.slice(-3).map(h => h.action).join('; ');
    const questions = [];

    // Based on task type and recent failures
    if (taskType === 'exploratory' && this.state.recentFailures.length > 0) {
      questions.push('What specific file names or patterns should I look for?');
      questions.push('Are there any specific directories I should focus on or ignore?');
    }

    if (this.state.repetitiveActionDetected) {
      questions.push('I\'ve been trying the same approach repeatedly. Can you suggest a different direction?');
    }

    if (this.state.noProgressCount >= 2) {
      questions.push('I\'m making slow progress. Should I simplify the task or break it into smaller pieces?');
      questions.push('Is there additional context or constraints I should know about?');
    }

    // General stuck questions
    if (questions.length === 0) {
      questions.push('I\'m stuck and need clarification. What should I prioritize?');
      questions.push('Are there any tools or approaches I haven\'t tried that might help?');
    }

    return questions;
  }

  /**
   * Ask user for clarification (interactive mode)
   * [Day 10]
   *
   * @param {Array<string>} questions - Questions to ask
   * @returns {Promise<string>} User's response
   */
  async askForClarification(questions) {
    // This will be called by the server when interactive mode is enabled
    // The agent pauses and waits for user input
    this.waitingForClarification = true;
    this.clarifyingQuestions = questions;

    console.log('[AutonomousAgent] Waiting for user clarification...');
    console.log('[AutonomousAgent] Questions:', questions);

    // Return control to server
    // Server will emit an event and wait for user response
    return {
      needsClarification: true,
      questions,
      currentState: {
        iteration: this.state.iteration,
        progress: this.state.lastProgressPercent,
        lastActions: this.state.history.slice(-3).map(h => h.action),
      },
    };
  }

  /**
   * Resume with user clarification
   * [Day 10]
   *
   * @param {string} userResponse - User's clarifying response
   */
  async resumeWithClarification(userResponse) {
    console.log('[AutonomousAgent] Received clarification:', userResponse);

    // Add clarification to history as a special entry
    this.state.history.push({
      iteration: this.state.iteration,
      action: 'user_clarification',
      result: userResponse,
      special: true,
    });

    this.waitingForClarification = false;
    this.clarifyingQuestions = null;

    // Reset stuck counters since we have new info
    this.state.noProgressCount = 0;
    this.state.repetitiveActionDetected = false;
  }

  /**
   * Request agent to stop at next iteration
   */
  requestStop() {
    console.log('[AutonomousAgent] Stop requested');
    this.stopRequested = true;
  }
}

/**
 * System prompt for reflection
 */
const REFLECTION_SYSTEM_PROMPT = `You are an autonomous agent working independently on a task.

Your job is to:
1. Honestly assess your progress
2. Decide the next concrete action
3. Know when to stop (task complete or stuck)

**Be truthful**: Don't claim progress if you haven't made any.
**Be specific**: Name exact files, commands, or tools in your next_action.
**Be decisive**: Choose COMPLETE only when truly confident (>90%).

**ITERATIVE REASONING PHILOSOPHY** (Critical):
With local inference, we optimize for MANY SMALL ITERATIONS rather than large responses:
- **Small steps**: Each iteration should do ONE focused thing
- **Unlimited turns**: Token limits per response, but NO limit on total iterations
- **Build up reasoning**: Many small thoughts → well-reasoned result
- **Memory is key**: Each iteration adds to our understanding
- **Favor clarity**: Short, clear responses over verbose ones
- **Think, then act**: Reflect → plan → execute → assess → repeat

**Multi-Step Workflow Strategy**:
When facing complex tasks requiring multiple steps:
1. **Break down** the task into clear phases (e.g., explore → design → implement → test → verify)
2. **Complete one phase** fully before moving to the next
3. **ONE action per iteration** - don't try to do multiple things at once
4. **Don't skip verification** - always test that each phase works before proceeding
5. **Track dependencies** - understand what each step requires
6. **Progress incrementally** - 10-20% progress per major phase

**Research Task Strategy**:
When analyzing codebases or gathering information:
1. **Start broad** - use read_dir to understand structure
2. **Then narrow** - read specific files that seem relevant
3. **Look for patterns** - similar code across files
4. **Summarize systematically** - organize findings clearly

**Code Generation Strategy**:
When creating code with tests:
1. **Design first** - plan the structure before writing
2. **Implement incrementally** - one function/feature at a time
3. **Test immediately** - verify each piece works
4. **Only claim complete** when tests pass

**Self-Improvement Strategy**:
When working on memory/reasoning tasks:
1. **Analyze current state** - what exists now?
2. **Identify gaps** - what's missing or could improve?
3. **Make targeted changes** - improve one thing at a time
4. **Verify improvement** - ensure changes actually help

**Important**:
- Use tool_plan to specify which tool you need next
- If stuck for 3 iterations, admit it - don't keep trying the same thing
- Learn from errors - if something fails, try a different approach
- Use past learnings when available to guide your strategy

You respond ONLY with valid JSON matching the schema.`;

/**
 * Create autonomous agent instance
 *
 * @param {AutonomousConfig} config
 * @returns {AutonomousAgent}
 */
export function createAutonomousAgent(config) {
  return new AutonomousAgent(config);
}
