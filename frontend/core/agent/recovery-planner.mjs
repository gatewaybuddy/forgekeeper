/**
 * Recovery Planner
 * [T306] Generates concrete recovery plans from error classifications
 *
 * Takes diagnostic analysis and produces prioritized, executable recovery strategies.
 */

import { ERROR_CATEGORIES } from './error-classifier.mjs';

/**
 * Create recovery planner instance
 *
 * @returns {Object} Recovery planner interface
 */
export function createRecoveryPlanner() {
  /**
   * Generate recovery plan from diagnosis
   *
   * @param {Object} diagnosis - Diagnostic reflection result
   * @param {Object} context - Execution context
   * @returns {Object} Recovery plan
   */
  function generateRecoveryPlan(diagnosis, context) {
    const errorCategory = diagnosis.rootCause?.category || ERROR_CATEGORIES.UNKNOWN;
    const availableTools = context.availableTools || [];
    const taskGoal = context.taskGoal || '';
    const failedTool = context.toolCall?.function?.name;
    const failedArgs = context.toolCall?.function?.arguments;

    console.log(`[RecoveryPlanner] Generating plan for ${errorCategory} (failed tool: ${failedTool})`);

    // Get recovery strategies for this error category
    const strategies = getRecoveryStrategies(errorCategory, {
      failedTool,
      failedArgs,
      availableTools,
      error: context.error,
      taskGoal,
    });

    // Filter strategies based on available tools
    const viableStrategies = strategies.filter(strategy => {
      if (!strategy.requiredTools || strategy.requiredTools.length === 0) {
        return true; // No tools required (e.g., ask_user)
      }
      return strategy.requiredTools.every(tool => availableTools.includes(tool));
    });

    if (viableStrategies.length === 0) {
      console.warn('[RecoveryPlanner] No viable strategies found');
      return {
        hasRecoveryPlan: false,
        reason: 'No recovery strategies available with current tools',
        suggestUserAction: true,
      };
    }

    // Sort by priority (confidence * simplicity)
    viableStrategies.sort((a, b) => {
      const scoreA = a.confidence * (1 / a.estimatedIterations);
      const scoreB = b.confidence * (1 / b.estimatedIterations);
      return scoreB - scoreA; // Higher score first
    });

    // Generate concrete recovery plan for top strategy
    const topStrategy = viableStrategies[0];
    const concretePlan = generateConcreteSteps(topStrategy, {
      failedTool,
      failedArgs,
      availableTools,
      error: context.error,
      taskGoal,
    });

    return {
      hasRecoveryPlan: true,
      primaryStrategy: {
        name: topStrategy.name,
        description: topStrategy.description,
        confidence: topStrategy.confidence,
        estimatedIterations: topStrategy.estimatedIterations,
        steps: concretePlan.steps,
      },
      fallbackStrategies: viableStrategies.slice(1, 3).map(s => ({
        name: s.name,
        description: s.description,
        confidence: s.confidence,
      })),
      maxRecoveryAttempts: 2, // Limit recovery attempts
    };
  }

  /**
   * Get recovery strategies for error category
   *
   * @param {string} errorCategory
   * @param {Object} context
   * @returns {Array} Recovery strategies
   */
  function getRecoveryStrategies(errorCategory, context) {
    switch (errorCategory) {
      case ERROR_CATEGORIES.COMMAND_NOT_FOUND:
        return getCommandNotFoundStrategies(context);

      case ERROR_CATEGORIES.TOOL_NOT_FOUND:
        return getToolNotFoundStrategies(context);

      case ERROR_CATEGORIES.PERMISSION_DENIED:
        return getPermissionDeniedStrategies(context);

      case ERROR_CATEGORIES.TIMEOUT:
        return getTimeoutStrategies(context);

      case ERROR_CATEGORIES.FILE_NOT_FOUND:
        return getFileNotFoundStrategies(context);

      case ERROR_CATEGORIES.INVALID_ARGUMENTS:
        return getInvalidArgumentsStrategies(context);

      case ERROR_CATEGORIES.SYNTAX_ERROR:
        return getSyntaxErrorStrategies(context);

      case ERROR_CATEGORIES.NETWORK_ERROR:
        return getNetworkErrorStrategies(context);

      default:
        return getGenericRecoveryStrategies(context);
    }
  }

  // ==========================================
  // Strategy Generators by Error Category
  // ==========================================

  function getCommandNotFoundStrategies(context) {
    const { error, failedArgs } = context;
    const command = error?.command || failedArgs?.script || '';

    const strategies = [];

    // Strategy 1: curl + tar for git clone
    if (command.includes('git clone')) {
      const urlMatch = command.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        const repoUrl = urlMatch[0].replace(/\.git$/, '');
        strategies.push({
          name: 'curl_download_and_extract',
          description: 'Download repository tarball via curl and extract with tar',
          confidence: 0.9,
          estimatedIterations: 3,
          requiredTools: ['run_bash'],
          template: {
            type: 'git_clone_fallback',
            repoUrl,
          },
        });
      }
    }

    // Strategy 2: Alternative command
    strategies.push({
      name: 'try_alternative_command',
      description: 'Use alternative command or approach',
      confidence: 0.6,
      estimatedIterations: 2,
      requiredTools: ['run_bash'],
      template: {
        type: 'alternative_command',
      },
    });

    // Strategy 3: Ask user
    strategies.push({
      name: 'ask_user_for_setup',
      description: 'Request user to install missing command or provide alternative',
      confidence: 0.8,
      estimatedIterations: 1,
      requiredTools: [],
      template: {
        type: 'ask_user',
      },
    });

    return strategies;
  }

  function getToolNotFoundStrategies(context) {
    const { availableTools, failedTool } = context;
    const alternatives = availableTools.filter(t => t !== failedTool).slice(0, 3);

    const strategies = [];

    // Strategy 1: Use available alternatives
    if (alternatives.length > 0) {
      strategies.push({
        name: 'use_alternative_tool',
        description: `Try using: ${alternatives.join(', ')}`,
        confidence: 0.7,
        estimatedIterations: 1,
        requiredTools: alternatives,
        template: {
          type: 'alternative_tool',
          alternatives,
        },
      });
    }

    // Strategy 2: Decompose into basic tools
    if (availableTools.includes('run_bash') || availableTools.includes('read_file')) {
      strategies.push({
        name: 'decompose_to_basic_tools',
        description: 'Break down into basic file/shell operations',
        confidence: 0.6,
        estimatedIterations: 3,
        requiredTools: ['run_bash'],
        template: {
          type: 'decompose',
        },
      });
    }

    return strategies;
  }

  function getPermissionDeniedStrategies(context) {
    const { failedArgs, availableTools } = context;
    const filePath = failedArgs?.file || failedArgs?.path || '';

    const strategies = [];

    // Strategy 1: Try sandbox directory
    if (availableTools.includes('write_file') || availableTools.includes('read_file')) {
      strategies.push({
        name: 'try_sandbox_directory',
        description: 'Write to sandbox-relative path instead',
        confidence: 0.9,
        estimatedIterations: 2,
        requiredTools: ['write_file', 'read_dir'],
        template: {
          type: 'sandbox_path',
          originalPath: filePath,
        },
      });
    }

    // Strategy 2: Ask user for permissions
    strategies.push({
      name: 'ask_user_for_permissions',
      description: 'Request user to adjust permissions or provide alternative path',
      confidence: 0.8,
      estimatedIterations: 1,
      requiredTools: [],
      template: {
        type: 'ask_user',
      },
    });

    return strategies;
  }

  function getTimeoutStrategies(context) {
    const { failedArgs } = context;

    const strategies = [];

    // Strategy 1: Reduce scope
    strategies.push({
      name: 'reduce_scope',
      description: 'Retry with smaller scope or simpler parameters',
      confidence: 0.8,
      estimatedIterations: 2,
      requiredTools: [context.failedTool],
      template: {
        type: 'reduce_scope',
        originalArgs: failedArgs,
      },
    });

    // Strategy 2: Increase timeout
    strategies.push({
      name: 'increase_timeout',
      description: 'Retry with higher timeout limit',
      confidence: 0.6,
      estimatedIterations: 1,
      requiredTools: [context.failedTool],
      template: {
        type: 'increase_timeout',
        originalArgs: failedArgs,
      },
    });

    return strategies;
  }

  function getFileNotFoundStrategies(context) {
    const { failedArgs, availableTools } = context;
    const filePath = failedArgs?.file || failedArgs?.path || '';

    const strategies = [];

    // Strategy 1: Verify path with read_dir
    if (availableTools.includes('read_dir')) {
      strategies.push({
        name: 'verify_path_with_listing',
        description: 'List parent directory to find correct file path',
        confidence: 0.9,
        estimatedIterations: 2,
        requiredTools: ['read_dir'],
        template: {
          type: 'verify_path',
          originalPath: filePath,
        },
      });
    }

    // Strategy 2: Search for file
    if (availableTools.includes('run_bash')) {
      strategies.push({
        name: 'search_for_file',
        description: 'Search for file in common locations',
        confidence: 0.7,
        estimatedIterations: 2,
        requiredTools: ['run_bash'],
        template: {
          type: 'search_file',
          fileName: filePath.split('/').pop(),
        },
      });
    }

    return strategies;
  }

  function getInvalidArgumentsStrategies(context) {
    const { failedArgs } = context;

    return [
      {
        name: 'fix_parameter_types',
        description: 'Retry with corrected parameter types',
        confidence: 1.0,
        estimatedIterations: 1,
        requiredTools: [context.failedTool],
        template: {
          type: 'fix_types',
          originalArgs: failedArgs,
        },
      },
    ];
  }

  function getSyntaxErrorStrategies(context) {
    return [
      {
        name: 'fix_syntax',
        description: 'Correct syntax errors and retry',
        confidence: 0.8,
        estimatedIterations: 1,
        requiredTools: [context.failedTool],
        template: {
          type: 'fix_syntax',
        },
      },
      {
        name: 'use_simpler_command',
        description: 'Break into simpler commands',
        confidence: 0.9,
        estimatedIterations: 2,
        requiredTools: ['run_bash'],
        template: {
          type: 'simplify',
        },
      },
    ];
  }

  function getNetworkErrorStrategies(context) {
    return [
      {
        name: 'retry_with_backoff',
        description: 'Wait and retry with exponential backoff',
        confidence: 0.7,
        estimatedIterations: 2,
        requiredTools: [context.failedTool],
        template: {
          type: 'retry_backoff',
        },
      },
    ];
  }

  function getGenericRecoveryStrategies(context) {
    return [
      {
        name: 'retry_with_modifications',
        description: 'Retry with modified parameters',
        confidence: 0.4,
        estimatedIterations: 2,
        requiredTools: [context.failedTool],
        template: {
          type: 'retry_modified',
        },
      },
      {
        name: 'ask_user_for_help',
        description: 'Request user assistance',
        confidence: 0.9,
        estimatedIterations: 1,
        requiredTools: [],
        template: {
          type: 'ask_user',
        },
      },
    ];
  }

  // ==========================================
  // Concrete Step Generation
  // ==========================================

  function generateConcreteSteps(strategy, context) {
    const { template } = strategy;

    switch (template.type) {
      case 'git_clone_fallback':
        return generateGitCloneFallbackSteps(template.repoUrl);

      case 'sandbox_path':
        return generateSandboxPathSteps(template.originalPath, context);

      case 'verify_path':
        return generateVerifyPathSteps(template.originalPath);

      case 'reduce_scope':
        return generateReduceScopeSteps(context);

      case 'fix_types':
        return generateFixTypesSteps(context);

      case 'ask_user':
        return generateAskUserSteps(context);

      default:
        return generateGenericSteps(strategy, context);
    }
  }

  function generateGitCloneFallbackSteps(repoUrl) {
    const repoName = repoUrl.split('/').pop();
    return {
      steps: [
        {
          action: 'Download repository tarball from GitHub',
          tool: 'run_bash',
          args: {
            script: `curl -L ${repoUrl}/archive/refs/heads/main.tar.gz -o ${repoName}.tar.gz`,
          },
          expectedOutcome: `${repoName}.tar.gz file created`,
        },
        {
          action: 'Extract tarball contents',
          tool: 'run_bash',
          args: {
            script: `tar -xzf ${repoName}.tar.gz`,
          },
          expectedOutcome: 'Repository files extracted',
        },
        {
          action: 'Verify extraction',
          tool: 'read_dir',
          args: {
            dir: `./${repoName}-main`,
          },
          expectedOutcome: 'Directory listing shows repository structure',
        },
      ],
    };
  }

  function generateSandboxPathSteps(originalPath, context) {
    const sandboxPath = `.forgekeeper/sandbox/${originalPath.split('/').pop()}`;
    return {
      steps: [
        {
          action: 'List sandbox directory to verify access',
          tool: 'read_dir',
          args: {
            dir: '.forgekeeper/sandbox',
          },
          expectedOutcome: 'Sandbox directory accessible',
        },
        {
          action: 'Retry operation with sandbox-relative path',
          tool: context.failedTool,
          args: {
            ...context.failedArgs,
            path: sandboxPath,
            file: sandboxPath,
          },
          expectedOutcome: 'Operation succeeds in sandbox',
        },
      ],
    };
  }

  function generateVerifyPathSteps(originalPath) {
    const parentDir = originalPath.split('/').slice(0, -1).join('/') || '.';
    return {
      steps: [
        {
          action: 'List parent directory',
          tool: 'read_dir',
          args: {
            dir: parentDir,
          },
          expectedOutcome: 'See available files in directory',
        },
      ],
    };
  }

  function generateReduceScopeSteps(context) {
    return {
      steps: [
        {
          action: 'Retry with reduced scope',
          tool: context.failedTool,
          args: {
            ...context.failedArgs,
            // Try to reduce parameters (this is a guess, needs refinement)
            timeout_ms: (context.failedArgs.timeout_ms || 15000) * 2,
          },
          expectedOutcome: 'Operation completes within timeout',
        },
      ],
    };
  }

  function generateFixTypesSteps(context) {
    return {
      steps: [
        {
          action: 'Retry with corrected parameter types',
          tool: context.failedTool,
          args: context.failedArgs, // Ideally would fix types here
          expectedOutcome: 'Parameters validated successfully',
        },
      ],
    };
  }

  function generateAskUserSteps(context) {
    return {
      steps: [
        {
          action: 'Request user assistance',
          tool: null, // Special case - triggers user interaction
          args: {
            question: `Unable to recover automatically from ${context.error?.message}. Please advise on how to proceed.`,
            context: {
              failedTool: context.failedTool,
              error: context.error?.message,
            },
          },
          expectedOutcome: 'User provides guidance',
        },
      ],
    };
  }

  function generateGenericSteps(strategy, context) {
    return {
      steps: [
        {
          action: strategy.description,
          tool: context.failedTool,
          args: context.failedArgs,
          expectedOutcome: 'Operation succeeds with alternative approach',
        },
      ],
    };
  }

  return {
    generateRecoveryPlan,
  };
}
