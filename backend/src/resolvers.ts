import { GraphQLJSON } from 'graphql-type-json';
import { PrismaClient } from '@prisma/client';
import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

const MQTT_BROKER = process.env.MQTT_BROKER || 'localhost';
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
    listConversations: async (_: any, __: any, { prisma }: Context) => {
      return prisma.conversation.findMany({ include: { messages: true } });
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
  },
  Mutation: {
    sendMessageToForgekeeper: async (_: any, { topic, message }: any, { prisma }: Context) => {
      const client = mqtt.connect(`mqtt://${MQTT_BROKER}`);
      client.publish(topic, JSON.stringify(message));
      client.end();

      const content = typeof message === 'object' ? message.content ?? '' : '';
      let conversationId = typeof message === 'object' ? message.conversationId : undefined;
      if (!conversationId) {
        conversationId = uuidv4();
      }
      await prisma.conversation.upsert({
        where: { id: conversationId },
        update: {},
        create: {
          id: conversationId,
          title: `Conversation ${conversationId}`,
          folder: 'root',
          archived: false,
        },
      });
      await prisma.message.create({
        data: {
          id: uuidv4(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          tokens: countTokensStub(content),
          conversationId,
        },
      });
      return true;
    },
    stopMessage: async () => {
      const client = mqtt.connect(`mqtt://${MQTT_BROKER}`);
      client.publish(STOP_TOPIC, JSON.stringify({ stop: true }));
      client.end();
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
  },
};

export default resolvers;
