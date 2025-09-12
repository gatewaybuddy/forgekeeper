import { GraphQLJSON } from 'graphql-type-json';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { registerNode, updateNode, listNodes, drainNode, chooseNodeForModel } from './gateway.ts';
import { v4 as uuidv4 } from 'uuid';
import * as crud from './crud.ts';

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
      return crud.findMany(prisma, 'conversation', { where, include: { messages: true } });
    },
    listFolders: async (_: any, __: any, { prisma }: Context) => {
      const folders = await crud.findMany(prisma, 'folder');
      const map: Record<string, any> = {};
      folders.forEach((f: any) => {
        map[f.name] = { name: f.name, children: [] };
      });
      const roots: any[] = [];
      folders.forEach((f: any) => {
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
      return crud.findMany(prisma, 'project', {
        include: { conversations: { include: { messages: true } } },
      });
    },
    project: async (_: any, { id }: any, { prisma }: Context) => {
      return crud.findUnique(prisma, 'project', {
        where: { id },
        include: { conversations: { include: { messages: true } } },
      });
    },
    getRuntimeConfig: async () => {
      try {
        const p = path.join(process.cwd(), '.forgekeeper', 'runtime_config.json');
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      } catch {
        return {};
      }
    },
    listGatewayNodes: async () => {
      return listNodes().map(n => ({ ...n, lastSeen: new Date(n.lastSeen).toISOString() }));
    },
    routeModel: async (_: any, { model }: any) => {
      const n = chooseNodeForModel(model);
      if (!n) return null;
      return { ...n, lastSeen: new Date(n.lastSeen).toISOString() } as any;
    },
  },
  Mutation: {
    sendMessageToForgekeeper: async (
      _: any,
      { topic, message, idempotencyKey, projectId }: any,
      { prisma }: Context
    ) => {
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

      await prisma.$transaction(async (tx) => {
        const convData: any = {
          id: conversationId,
          title: `Conversation ${conversationId}`,
          folder: 'root',
          archived: false,
        };
        if (projectId) convData.projectId = projectId;
        await crud.upsert(tx, 'conversation', {
          where: { id: conversationId },
          update: projectId ? { projectId } : {},
          create: convData,
        });
        await crud.create(tx, 'message', {
          id: uuidv4(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          tokens: countTokensStub(content),
          conversationId,
        });
        await crud.create(tx, 'outbox', {
          id: uuidv4(),
          topic,
          payload: message,
          idempotencyKey,
        });
      });
      return true;
    },
    stopMessage: async (_: any, { idempotencyKey }: any, { prisma }: Context) => {
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
    moveConversationToFolder: async (_: any, { conversationId, folder }: any, { prisma }: Context) => {
      await crud.update(prisma, 'conversation', {
        where: { id: conversationId },
        data: { folder },
      });
      return true;
    },
    deleteConversation: async (_: any, { conversationId }: any, { prisma }: Context) => {
      await crud.removeMany(prisma, 'message', { where: { conversationId } });
      await crud.remove(prisma, 'conversation', { where: { id: conversationId } });
      return true;
    },
    archiveConversation: async (_: any, { conversationId }: any, { prisma }: Context) => {
      await crud.update(prisma, 'conversation', {
        where: { id: conversationId },
        data: { archived: true },
      });
      return true;
    },
    createFolder: async (_: any, { name, parent }: any, { prisma }: Context) => {
      await crud.create(prisma, 'folder', { name, parent });
      return true;
    },
    renameFolder: async (_: any, { oldName, newName }: any, { prisma }: Context) => {
      await crud.update(prisma, 'folder', { where: { name: oldName }, data: { name: newName } as any });
      await crud.updateMany(prisma, 'folder', { where: { parent: oldName }, data: { parent: newName } });
      return true;
    },

    appendMessage: async (
      _: any,
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

    createProject: async (_: any, { name, description }: any, { prisma }: Context) => {
      return crud.create(
        prisma,
        'project',
        { id: uuidv4(), name, description },
        { include: { conversations: { include: { messages: true } } } },
      );
    },
    updateProject: async (_: any, { id, name, description }: any, { prisma }: Context) => {
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      return crud.update(prisma, 'project', {
        where: { id },
        data,
        include: { conversations: { include: { messages: true } } },
      });
    },
    deleteProject: async (_: any, { id }: any, { prisma }: Context) => {
      await crud.updateMany(prisma, 'conversation', { where: { projectId: id }, data: { projectId: null } });
      await crud.remove(prisma, 'project', { where: { id } });
      return true;
    },
    setRuntimeConfig: async (_: any, { patch }: any) => {
      const dir = path.join(process.cwd(), '.forgekeeper');
      const file = path.join(dir, 'runtime_config.json');
      let current: any = {};
      try {
        current = JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch {}
      const next = { ...current, ...(patch || {}) };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8');
      return true;
    },
    requestRestart: async () => {
      const dir = path.join(process.cwd(), '.forgekeeper');
      const flag = path.join(dir, 'restart.flag');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(flag, 'requested', 'utf-8');
      return true;
    },
    registerGatewayNode: async (_: any, { id, url, models, capacity }: any) => {
      registerNode(id, url, models, capacity ?? 1);
      return true;
    },
    updateGatewayNode: async (_: any, { id, queueDepth, healthy, models, capacity }: any) => {
      updateNode(id, { queueDepth, healthy, models, capacity } as any);
      return true;
    },
    drainGatewayNode: async (_: any, { id, drain }: any) => {
      return drainNode(id, drain);
    },
  },
  Project: {
    createdAt: (p: any) => (p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt),
    updatedAt: (p: any) => (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt),
  },
};

export default resolvers;
