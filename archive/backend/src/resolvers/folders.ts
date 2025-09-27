import * as crud from '../crud.js';
import type { Context } from './context.js';

const foldersResolvers = {
  Query: {
    listFolders: async (_: unknown, __: unknown, { prisma }: Context) => {
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
  },
  Mutation: {
    createFolder: async (_: unknown, { name, parent }: any, { prisma }: Context) => {
      await crud.create(prisma, 'folder', { name, parent });
      return true;
    },
    renameFolder: async (_: unknown, { oldName, newName }: any, { prisma }: Context) => {
      await crud.update(prisma, 'folder', { where: { name: oldName }, data: { name: newName } as any });
      await crud.updateMany(prisma, 'folder', { where: { parent: oldName }, data: { parent: newName } });
      return true;
    },
  },
};

export default foldersResolvers;
