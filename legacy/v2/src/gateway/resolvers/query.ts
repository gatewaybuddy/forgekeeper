/**
 * GraphQL Query Resolvers
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../utils/prisma.js';
import { getRouter } from '../../inference/router.js';
import { getAgentStatus } from '../../agents/registry.js';
import { getDashboard } from '../../metrics/dashboard.js';
import { getToolExecutor } from '../../tools/executor.js';
import { logger } from '../../utils/logger.js';

export const queryResolvers = {
  Query: {
    /**
     * Get session by ID
     */
    session: async (_parent: any, args: { id: string }) => {
      const session = await prisma.session.findUnique({
        where: { id: args.id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          events: {
            orderBy: { createdAt: 'asc' },
          },
          metrics: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!session) {
        return null;
      }

      return {
        ...session,
        workspace: JSON.parse(session.workspace),
        config: JSON.parse(session.config),
        metrics: session.metrics[0] || null,
      };
    },

    /**
     * Get all sessions with pagination
     */
    sessions: async (_parent: any, args: { limit?: number; offset?: number }) => {
      const sessions = await prisma.session.findMany({
        take: args.limit || 10,
        skip: args.offset || 0,
        orderBy: { createdAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          events: {
            orderBy: { createdAt: 'asc' },
          },
          metrics: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      return sessions.map((session) => ({
        ...session,
        workspace: JSON.parse(session.workspace),
        config: JSON.parse(session.config),
        metrics: session.metrics[0] || null,
      }));
    },

    /**
     * Get workspace for session
     */
    workspace: async (_parent: any, args: { sessionId: string }) => {
      const session = await prisma.session.findUnique({
        where: { id: args.sessionId },
      });

      if (!session) {
        return null;
      }

      return JSON.parse(session.workspace);
    },

    /**
     * Get agent status
     */
    agentStatus: async () => {
      const router = getRouter();
      const agents = (await import('../../agents/registry.js')).createAgents(router);
      const status = await getAgentStatus(agents);

      return status;
    },

    /**
     * Get provider status
     */
    providerStatus: async () => {
      const router = getRouter();
      const health = await router.healthCheckAll();

      return {
        localQwen: health['local-qwen'],
        claude: health['claude'] || null,
      };
    },

    /**
     * Get consciousness metrics for session
     */
    consciousnessMetrics: async (_parent: any, args: { sessionId: string }) => {
      const dashboard = getDashboard();
      return dashboard.getSessionMetrics(args.sessionId);
    },

    /**
     * Get system-wide metrics
     */
    systemMetrics: async () => {
      const dashboard = getDashboard();
      return dashboard.getSystemMetrics();
    },

    /**
     * Get top performing sessions
     */
    topSessions: async (_parent: any, args: { limit?: number }) => {
      const dashboard = getDashboard();
      const topSessions = dashboard.getTopSessions(args.limit || 5);

      return topSessions.map((s) => s.metrics);
    },

    /**
     * Health check
     */
    health: async () => {
      const dashboard = getDashboard();
      const health = dashboard.getHealth();

      return health.status;
    },

    /**
     * Get all available tools
     */
    tools: async () => {
      const executor = getToolExecutor();
      const definitions = executor.getDefinitions();

      return definitions.map((def) => ({
        name: def.function.name,
        description: def.function.description,
        parameters: def.function.parameters,
      }));
    },

    /**
     * Get specific tool definition
     */
    tool: async (_parent: any, args: { name: string }) => {
      const executor = getToolExecutor();
      const tool = executor.get(args.name);

      if (!tool) {
        return null;
      }

      return {
        name: tool.definition.function.name,
        description: tool.definition.function.description,
        parameters: tool.definition.function.parameters,
      };
    },

    /**
     * Get testing instructions for Claude plugin
     */
    testingInstructions: async () => {
      try {
        const instructionsPath = path.join(
          process.cwd(),
          'TESTING_INSTRUCTIONS_FOR_CLAUDE_PLUGIN.md'
        );
        const content = await fs.readFile(instructionsPath, 'utf-8');
        return content;
      } catch (error) {
        logger.error({ error }, 'Failed to read testing instructions');
        return 'Error: Testing instructions file not found';
      }
    },
  },
};
