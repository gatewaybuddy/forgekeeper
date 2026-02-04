import { GraphQLJSON } from 'graphql-type-json';
import { v4 as uuidv4 } from 'uuid';
import * as crud from './crud.js';
const STOP_TOPIC = 'forgekeeper/stop';
function countTokensStub(text) {
    return text.split(/\s+/).filter(Boolean).length;
}
const resolvers = {
    JSON: GraphQLJSON,
    Query: {
        listConversations: async (_, { projectId }, { prisma }) => {
            const where = projectId ? { projectId } : {};
            return crud.findMany(prisma, 'conversation', { where, include: { messages: true } });
        },
        listFolders: async (_, __, { prisma }) => {
            const folders = await crud.findMany(prisma, 'folder');
            const map = {};
            folders.forEach((f) => {
                map[f.name] = { name: f.name, children: [] };
            });
            const roots = [];
            folders.forEach((f) => {
                const node = map[f.name];
                if (f.parent) {
                    map[f.parent]?.children.push(node);
                }
                else {
                    roots.push(node);
                }
            });
            return roots;
        },
        listProjects: async (_, __, { prisma }) => {
            return crud.findMany(prisma, 'project', {
                include: { conversations: { include: { messages: true } } },
            });
        },
        project: async (_, { id }, { prisma }) => {
            return crud.findUnique(prisma, 'project', {
                where: { id },
                include: { conversations: { include: { messages: true } } },
            });
        },
    },
    Mutation: {
        sendMessageToForgekeeper: async (_, { topic, message, idempotencyKey, projectId }, { prisma }) => {
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
                const convData = {
                    id: conversationId,
                    title: `Conversation ${conversationId}`,
                    folder: 'root',
                    archived: false,
                };
                if (projectId)
                    convData.projectId = projectId;
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
        stopMessage: async (_, { idempotencyKey }, { prisma }) => {
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
        moveConversationToFolder: async (_, { conversationId, folder }, { prisma }) => {
            await crud.update(prisma, 'conversation', {
                where: { id: conversationId },
                data: { folder },
            });
            return true;
        },
        deleteConversation: async (_, { conversationId }, { prisma }) => {
            await crud.removeMany(prisma, 'message', { where: { conversationId } });
            await crud.remove(prisma, 'conversation', { where: { id: conversationId } });
            return true;
        },
        archiveConversation: async (_, { conversationId }, { prisma }) => {
            await crud.update(prisma, 'conversation', {
                where: { id: conversationId },
                data: { archived: true },
            });
            return true;
        },
        createFolder: async (_, { name, parent }, { prisma }) => {
            await crud.create(prisma, 'folder', { name, parent });
            return true;
        },
        renameFolder: async (_, { oldName, newName }, { prisma }) => {
            await crud.update(prisma, 'folder', { where: { name: oldName }, data: { name: newName } });
            await crud.updateMany(prisma, 'folder', { where: { parent: oldName }, data: { parent: newName } });
            return true;
        },
        appendMessage: async (_, { conversationId, role, content }, { prisma }) => {
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
        createProject: async (_, { name, description }, { prisma }) => {
            return crud.create(prisma, 'project', { id: uuidv4(), name, description }, { include: { conversations: { include: { messages: true } } } });
        },
        updateProject: async (_, { id, name, description }, { prisma }) => {
            const data = {};
            if (name !== undefined)
                data.name = name;
            if (description !== undefined)
                data.description = description;
            return crud.update(prisma, 'project', {
                where: { id },
                data,
                include: { conversations: { include: { messages: true } } },
            });
        },
        deleteProject: async (_, { id }, { prisma }) => {
            await crud.updateMany(prisma, 'conversation', { where: { projectId: id }, data: { projectId: null } });
            await crud.remove(prisma, 'project', { where: { id } });
            return true;
        },
    },
    Project: {
        createdAt: (p) => (p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt),
        updatedAt: (p) => (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt),
    },
};
export default resolvers;
