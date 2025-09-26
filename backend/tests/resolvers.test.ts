import assert from 'node:assert/strict';
import conversationsResolvers from '../src/resolvers/conversations.js';
import projectsResolvers from '../src/resolvers/projects.js';
import foldersResolvers from '../src/resolvers/folders.js';
import runtimeConfigResolvers from '../src/resolvers/runtimeConfig.js';
import gatewayResolvers from '../src/resolvers/gateway.js';
import combinedResolvers, { mergeResolverMaps } from '../src/resolvers/index.js';
import { GraphQLJSON } from 'graphql-type-json';

type ResolverSection = Record<string, unknown> | undefined;

type ModuleTest = {
  name: string;
  module: Record<string, any>;
  queryKeys?: string[];
  mutationKeys?: string[];
  typeKeys?: Record<string, string[]>;
};

const moduleTests: ModuleTest[] = [
  {
    name: 'conversations',
    module: conversationsResolvers,
    queryKeys: ['listConversations'],
    mutationKeys: [
      'sendMessageToForgekeeper',
      'stopMessage',
      'moveConversationToFolder',
      'deleteConversation',
      'archiveConversation',
      'appendMessage',
    ],
  },
  {
    name: 'projects',
    module: projectsResolvers,
    queryKeys: ['listProjects', 'project'],
    mutationKeys: ['createProject', 'updateProject', 'deleteProject'],
    typeKeys: { Project: ['createdAt', 'updatedAt'] },
  },
  {
    name: 'folders',
    module: foldersResolvers,
    queryKeys: ['listFolders'],
    mutationKeys: ['createFolder', 'renameFolder'],
  },
  {
    name: 'runtimeConfig',
    module: runtimeConfigResolvers,
    queryKeys: ['getRuntimeConfig'],
    mutationKeys: ['setRuntimeConfig', 'requestRestart'],
  },
  {
    name: 'gateway',
    module: gatewayResolvers,
    queryKeys: ['listGatewayNodes', 'routeModel'],
    mutationKeys: ['registerGatewayNode', 'updateGatewayNode', 'drainGatewayNode'],
  },
];

function assertHasKeys(section: ResolverSection, expected: string[], label: string) {
  assert.ok(section, `${label} section should exist`);
  const keys = Object.keys(section!);
  for (const key of expected) {
    assert.ok(keys.includes(key), `${label} should expose ${key}`);
  }
}

async function runModuleTests() {
  for (const test of moduleTests) {
    if (test.queryKeys) {
      assertHasKeys(test.module.Query, test.queryKeys, `${test.name}.Query`);
    }
    if (test.mutationKeys) {
      assertHasKeys(test.module.Mutation, test.mutationKeys, `${test.name}.Mutation`);
    }
    if (test.typeKeys) {
      for (const [typeName, keys] of Object.entries(test.typeKeys)) {
        assertHasKeys(test.module[typeName], keys, `${test.name}.${typeName}`);
      }
    }
  }
}

async function runMergeTests() {
  const merged = mergeResolverMaps([
    { Query: { hello: () => 'hi' } },
    { Query: { goodbye: () => 'bye' }, Mutation: { doThing: () => true } },
  ]);
  assert.equal(typeof merged.Query.hello, 'function');
  assert.equal(typeof merged.Query.goodbye, 'function');
  assert.equal(typeof merged.Mutation.doThing, 'function');

  const jsonScalar = combinedResolvers.JSON;
  assert.strictEqual(jsonScalar, GraphQLJSON, 'Combined resolvers should expose JSON scalar');

  for (const test of moduleTests) {
    const queryKeys = test.queryKeys ?? [];
    const mutationKeys = test.mutationKeys ?? [];
    const typeKeysEntries = Object.entries(test.typeKeys ?? {});

    if (queryKeys.length) {
      assertHasKeys(combinedResolvers.Query, queryKeys, `combined.Query (${test.name})`);
      for (const key of queryKeys) {
        assert.strictEqual(
          combinedResolvers.Query[key],
          test.module.Query?.[key],
          `Combined Query.${key} should reference ${test.name} implementation`,
        );
      }
    }

    if (mutationKeys.length) {
      assertHasKeys(combinedResolvers.Mutation, mutationKeys, `combined.Mutation (${test.name})`);
      for (const key of mutationKeys) {
        assert.strictEqual(
          combinedResolvers.Mutation[key],
          test.module.Mutation?.[key],
          `Combined Mutation.${key} should reference ${test.name} implementation`,
        );
      }
    }

    for (const [typeName, keys] of typeKeysEntries) {
      assertHasKeys(combinedResolvers[typeName], keys, `combined.${typeName} (${test.name})`);
      for (const key of keys) {
        assert.strictEqual(
          combinedResolvers[typeName][key],
          test.module[typeName]?.[key],
          `Combined ${typeName}.${key} should reference ${test.name} implementation`,
        );
      }
    }
  }
}

async function main() {
  await runModuleTests();
  await runMergeTests();
  console.log('Resolver module tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
