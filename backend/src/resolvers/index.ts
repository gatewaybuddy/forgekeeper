import { GraphQLJSON } from 'graphql-type-json';
import conversationsResolvers from './conversations.js';
import projectsResolvers from './projects.js';
import foldersResolvers from './folders.js';
import runtimeConfigResolvers from './runtimeConfig.js';
import gatewayResolvers from './gateway.js';

export type ResolverMap = Record<string, any>;

function isPlainObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as any).constructor === Object
  );
}

function mergeObjects(target: any, source: any): any {
  if (!isPlainObject(source)) {
    return source;
  }
  const result = { ...(isPlainObject(target) ? target : {}) };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    if (isPlainObject(value)) {
      result[key] = mergeObjects(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function mergeResolverMaps(resolverMaps: ResolverMap[]): ResolverMap {
  return resolverMaps.reduce<ResolverMap>((acc, map) => mergeObjects(acc, map), {});
}

const resolvers = mergeResolverMaps([
  { JSON: GraphQLJSON },
  conversationsResolvers,
  projectsResolvers,
  foldersResolvers,
  runtimeConfigResolvers,
  gatewayResolvers,
]);

export default resolvers;
