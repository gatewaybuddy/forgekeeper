import { GraphQLJSON } from 'graphql-type-json';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const STOP_TOPIC = 'forgekeeper/stop';

function countTokensStub(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

interface Context {
  prisma: PrismaClient;
}

const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    listConversations: async (_: any, { projectId }: any, { prisma }: Context) => {
      const where = projectId ? { projectId } : {};
      return prisma.conversation.findMany({ where, include: { messages: true } });
    },
    listFolders: async (_: any, __: any, { prisma }: Context) => {
      const folders = await prisma.folder.findMany();
      const map: Record<string, any> = {};
      folders.forEach(f => {
        map[f.name] = { name: f.name, children: [] };
      });
      const roots: any[] = [];
      folders.forEach(f => {
        const node = map[f.name];
        if (f.parent) {
          map[f.parent]?.children.push(node);
        } else {
          roots.push(node);
        }
      });
      return roots;
    },
    listProjects: async (_: any, __: any, { prisma }: Context) => {
      return prisma.project.findMany();
    },
  },
  Mutation: {
    sendMessageToForgekeeper: async (
      _: any,
      { topic, message, idempotencyKey, projectId }: any,
      { prisma }: Context
    ) => {
      if (idempotencyKey) {
        const existing = await prisma.outbox.findUnique({ where: { idempotencyKey } });
        if (existing) {
          return true;
        }
      }

      const content = typeof message === 'object' ? message.content ?? '' : '';
      let conversationId = typeof message === 'object' ? message.conversationId : undefined;
      if (!conversationId) {
        conversationId = uuidv4();
      }

      await prisma.$transaction(async (tx) => {
        const convData: any = {
          id: conversationId,
          title: `Conversation ${conversationId}`,
          folder: 'root',
          archived: false,
        };
        if (projectId) convData.projectId = projectId;
        await tx.conversation.upsert({
          where: { id: conversationId },
          update: projectId ? { projectId } : {},
          create: convData,
        });
        await tx.message.create({
          data: {
            id: uuidv4(),
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
            tokens: countTokensStub(content),
            conversationId,
          },
        });
        await tx.outbox.create({
          data: {
            id: uuidv4(),
            topic,
            payload: message,
            idempotencyKey,
          },
        });
      });
      return true;
    },
    stopMessage: async (_: any, { idempotencyKey }: any, { prisma }: Context) => {
      if (idempotencyKey) {
        const existing = await prisma.outbox.findUnique({ where: { idempotencyKey } });
        if (existing) {
          return true;
        }
      }
      await prisma.outbox.create({
        data: {
          id: uuidv4(),
          topic: STOP_TOPIC,
          payload: { stop: true },
          idempotencyKey,
        },
      });
      return true;
    },
    moveConversationToFolder: async (_: any, { conversationId, folder }: any, { prisma }: Context) => {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { folder },
      });
      return true;
    },
    deleteConversation: async (_: any, { conversationId }: any, { prisma }: Context) => {
      await prisma.message.deleteMany({ where: { conversationId } });
      await prisma.conversation.delete({ where: { id: conversationId } });
      return true;
    },
    archiveConversation: async (_: any, { conversationId }: any, { prisma }: Context) => {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { archived: true },
      });
      return true;
    },
    createFolder: async (_: any, { name, parent }: any, { prisma }: Context) => {
      await prisma.folder.create({ data: { name, parent } });
      return true;
    },
    renameFolder: async (_: any, { oldName, newName }: any, { prisma }: Context) => {
      await prisma.folder.update({ where: { name: oldName }, data: { name: newName } });
      await prisma.folder.updateMany({ where: { parent: oldName }, data: { parent: newName } });
      return true;
    },
    createProject: async (_: any, { name }: any, { prisma }: Context) => {
      const id = uuidv4();
      return prisma.project.create({ data: { id, name } });
    },
  },
};

export default resolvers;
