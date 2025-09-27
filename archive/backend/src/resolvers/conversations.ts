import { v4 as uuidv4 } from 'uuid';
import * as crud from '../crud.js';
import type { Context } from './context.js';
import { inferAssistantReply } from '../infer.js';

const STOP_TOPIC = 'forgekeeper/stop';

function countTokensStub(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const conversationsResolvers = {
  Query: {
    listConversations: async (_: unknown, { projectId }: { projectId?: string }, { prisma }: Context) => {
      const where = projectId ? { projectId } : {};
      return crud.findMany(prisma, 'conversation', { where, include: { messages: true } });
    },
  },
  Mutation: {
    sendMessageToForgekeeper: async (
      _: unknown,
      { topic, message, idempotencyKey, projectId }: any,
      { prisma }: Context,
    ) => {
      // Idempotency check outside of a transaction for single-node Mongo
      if (idempotencyKey) {
        const existing = await crud.findUnique(prisma, 'outbox', { where: { idempotencyKey } });
        if (existing) {
          return true;
        }
      }

      const content = typeof message === 'object' ? message.content ?? '' : '';
      let conversationId = typeof message === 'object' ? message.conversationId : undefined;
      if (!conversationId) {
        conversationId = uuidv4();
      }

      const convData: any = {
        id: conversationId,
        title: `Conversation ${conversationId}`,
        folder: 'root',
        archived: false,
      };
      if (projectId) convData.projectId = projectId;

      // Upsert conversation, then create message and outbox sequentially
      await crud.upsert(prisma, 'conversation', {
        where: { id: conversationId },
        update: projectId ? { projectId } : {},
        create: convData,
      });
      await crud.create(prisma, 'message', {
        id: uuidv4(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        tokens: countTokensStub(content),
        conversationId,
      });
      await crud.create(prisma, 'outbox', {
        id: uuidv4(),
        topic,
        payload: message,
        idempotencyKey,
      });

      // Optionally perform direct inference and append assistant message
      try {
        const reply = await inferAssistantReply(content);
        if (reply && typeof reply === 'string') {
          await crud.create(prisma, 'message', {
            id: uuidv4(),
            role: 'assistant',
            content: reply,
            timestamp: new Date().toISOString(),
            tokens: countTokensStub(reply),
            conversationId,
          });
        }
      } catch (e) {
        // Non-fatal: logging is sufficient in server stdout
        // eslint-disable-next-line no-console
        console.error('Direct inference failed:', e);
      }
      return true;
    },
    stopMessage: async (_: unknown, { idempotencyKey }: any, { prisma }: Context) => {
      if (idempotencyKey) {
        const existing = await crud.findUnique(prisma, 'outbox', { where: { idempotencyKey } });
        if (existing) {
          return true;
        }
      }
      await crud.create(prisma, 'outbox', {
        id: uuidv4(),
        topic: STOP_TOPIC,
        payload: { stop: true },
        idempotencyKey,
      });
      return true;
    },
    moveConversationToFolder: async (_: unknown, { conversationId, folder }: any, { prisma }: Context) => {
      await crud.update(prisma, 'conversation', {
        where: { id: conversationId },
        data: { folder },
      });
      return true;
    },
    deleteConversation: async (_: unknown, { conversationId }: any, { prisma }: Context) => {
      await crud.removeMany(prisma, 'message', { where: { conversationId } });
      await crud.remove(prisma, 'conversation', { where: { id: conversationId } });
      return true;
    },
    archiveConversation: async (_: unknown, { conversationId }: any, { prisma }: Context) => {
      await crud.update(prisma, 'conversation', {
        where: { id: conversationId },
        data: { archived: true },
      });
      return true;
    },
    appendMessage: async (
      _: unknown,
      { conversationId, role, content }: any,
      { prisma }: Context,
    ) => {
      await crud.create(prisma, 'message', {
        id: uuidv4(),
        role,
        content,
        timestamp: new Date().toISOString(),
        tokens: countTokensStub(content),
        conversationId,
      });
      return true;
    },
  },
};

export default conversationsResolvers;
