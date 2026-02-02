/**
 * GraphQL Mutation Resolvers
 */
import { prisma } from '../../utils/prisma.js';
import { getRouterReady } from '../../inference/router.js';
import { createAgents } from '../../agents/registry.js';
import { Orchestrator } from '../../orchestrator/workflow.js';
import { getToolExecutor } from '../../tools/executor.js';
import { logger } from '../../utils/logger.js';

export const mutationResolvers = {
  Mutation: {
    /**
     * Start orchestration
     */
    orchestrate: async (
      _parent: any,
      args: {
        input: {
          sessionId?: string;
          userMessage: string;
          maxIterations?: number;
        };
      }
    ) => {
      logger.info({ input: args.input }, 'Orchestrate mutation called');

      const router = await getRouterReady();
      const agents = createAgents(router);
      const orchestrator = new Orchestrator(agents);

      try {
        const result = await orchestrator.orchestrate({
          sessionId: args.input.sessionId,
          userMessage: args.input.userMessage,
          maxIterations: args.input.maxIterations,
        });

        return {
          sessionId: result.sessionId,
          iterations: result.iterations,
          finalDecision: result.finalDecision,
          workspace: result.workspace,
          metrics: result.metrics,
        };
      } catch (error) {
        logger.error({ error, input: args.input }, 'Orchestration failed');
        throw error;
      }
    },

    /**
     * Create new session
     */
    createSession: async () => {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const session = await prisma.session.create({
        data: {
          id: sessionId,
          workspace: JSON.stringify({
            currentFocus: '',
            hypotheses: [],
            decisions: [],
            toolResults: [],
            episodicMatches: [],
            pendingChallenges: [],
            tokenCount: 0,
            iteration: 0,
          }),
          config: JSON.stringify({}),
          status: 'active',
        },
      });

      return {
        ...session,
        workspace: JSON.parse(session.workspace),
        config: JSON.parse(session.config),
        messages: [],
        events: [],
        metrics: null,
      };
    },

    /**
     * Delete session
     */
    deleteSession: async (_parent: any, args: { id: string }) => {
      try {
        await prisma.session.delete({
          where: { id: args.id },
        });

        logger.info({ sessionId: args.id }, 'Session deleted');

        return true;
      } catch (error) {
        logger.error({ error, sessionId: args.id }, 'Failed to delete session');
        return false;
      }
    },

    /**
     * Execute a tool
     */
    executeTool: async (
      _parent: any,
      args: { name: string; args: any; sessionId?: string }
    ) => {
      logger.info({ tool: args.name, sessionId: args.sessionId }, 'Executing tool');

      const executor = getToolExecutor();

      try {
        const result = await executor.execute(args.name, args.args, {
          sessionId: args.sessionId || 'direct',
        });

        return result;
      } catch (error) {
        logger.error({ error, tool: args.name }, 'Tool execution failed');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
};
