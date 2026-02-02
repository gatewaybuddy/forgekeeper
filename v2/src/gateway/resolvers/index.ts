/**
 * Combined GraphQL Resolvers
 */
import { GraphQLScalarType, Kind } from 'graphql';
import { queryResolvers } from './query.js';
import { mutationResolvers } from './mutation.js';
import { subscriptionResolvers } from './subscription.js';

// Custom scalar for JSON
const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  serialize(value: any) {
    return value; // Return as-is
  },
  parseValue(value: any) {
    return value; // Return as-is
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      return parseObject(ast);
    }
    return null;
  },
});

function parseObject(ast: any): any {
  const value: any = {};
  ast.fields.forEach((field: any) => {
    value[field.name.value] = parseLiteral(field.value);
  });
  return value;
}

function parseLiteral(ast: any): any {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT:
      return parseObject(ast);
    case Kind.LIST:
      return ast.values.map(parseLiteral);
    default:
      return null;
  }
}

// Custom scalar for DateTime
const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value: any) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

// Field resolvers for nested types
const fieldResolvers = {
  Session: {
    metrics: (parent: any) => {
      // Return the first metrics snapshot (most recent)
      if (parent.metrics && parent.metrics.length > 0) {
        const metrics = parent.metrics[0];
        return {
          ...metrics,
          agentParticipation: JSON.parse(metrics.agentParticipation),
        };
      }
      return null;
    },
  },

  Event: {
    data: (parent: any) => {
      if (typeof parent.data === 'string') {
        return JSON.parse(parent.data);
      }
      return parent.data;
    },
  },

  MetricSnapshot: {
    agentParticipation: (parent: any) => {
      if (typeof parent.agentParticipation === 'string') {
        return JSON.parse(parent.agentParticipation);
      }
      return parent.agentParticipation;
    },
  },
};

// Combine all resolvers
export const resolvers = {
  JSON: JSONScalar,
  DateTime: DateTimeScalar,
  ...queryResolvers,
  ...mutationResolvers,
  ...subscriptionResolvers,
  ...fieldResolvers,
};
