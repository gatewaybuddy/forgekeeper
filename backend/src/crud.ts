import { PrismaClient } from '@prisma/client';

// Generic CRUD helpers wrapping Prisma model delegates. The `db` parameter
// can be a `PrismaClient` instance or a transaction delegate passed from
// `prisma.$transaction`. Model names are provided as strings to avoid
// repeating the same Prisma calls throughout resolvers.

type PrismaModel = keyof PrismaClient;

export async function create(db: PrismaClient | any, model: PrismaModel, data: any, args: any = {}) {
  return (db[model] as any).create({ ...args, data });
}

export async function findMany(db: PrismaClient | any, model: PrismaModel, args: any = {}) {
  return (db[model] as any).findMany(args);
}

export async function findUnique(db: PrismaClient | any, model: PrismaModel, args: any) {
  return (db[model] as any).findUnique(args);
}

export async function update(db: PrismaClient | any, model: PrismaModel, args: any) {
  return (db[model] as any).update(args);
}

export async function updateMany(db: PrismaClient | any, model: PrismaModel, args: any) {
  return (db[model] as any).updateMany(args);
}

export async function upsert(db: PrismaClient | any, model: PrismaModel, args: any) {
  return (db[model] as any).upsert(args);
}

export async function remove(db: PrismaClient | any, model: PrismaModel, args: any) {
  return (db[model] as any).delete(args);
}

export async function removeMany(db: PrismaClient | any, model: PrismaModel, args: any) {
  return (db[model] as any).deleteMany(args);
}

