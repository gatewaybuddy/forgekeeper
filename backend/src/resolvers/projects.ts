import { v4 as uuidv4 } from 'uuid';
import * as crud from '../crud.js';
import type { Context } from './context.js';

const projectsResolvers = {
  Query: {
    listProjects: async (_: unknown, __: unknown, { prisma }: Context) => {
      return crud.findMany(prisma, 'project', {
        include: { conversations: { include: { messages: true } } },
      });
    },
    project: async (_: unknown, { id }: any, { prisma }: Context) => {
      return crud.findUnique(prisma, 'project', {
        where: { id },
        include: { conversations: { include: { messages: true } } },
      });
    },
  },
  Mutation: {
    createProject: async (_: unknown, { name, description }: any, { prisma }: Context) => {
      return crud.create(
        prisma,
        'project',
        { id: uuidv4(), name, description },
        { include: { conversations: { include: { messages: true } } } },
      );
    },
    updateProject: async (_: unknown, { id, name, description }: any, { prisma }: Context) => {
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      return crud.update(prisma, 'project', {
        where: { id },
        data,
        include: { conversations: { include: { messages: true } } },
      });
    },
    deleteProject: async (_: unknown, { id }: any, { prisma }: Context) => {
      await crud.updateMany(prisma, 'conversation', { where: { projectId: id }, data: { projectId: null } });
      await crud.remove(prisma, 'project', { where: { id } });
      return true;
    },
  },
  Project: {
    createdAt: (p: any) => (p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt),
    updatedAt: (p: any) => (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt),
  },
};

export default projectsResolvers;
