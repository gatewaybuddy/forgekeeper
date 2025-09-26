import { registerNode, updateNode, listNodes, drainNode, chooseNodeForModel } from '../gateway.js';

const gatewayResolvers = {
  Query: {
    listGatewayNodes: async () => {
      return listNodes().map((n) => ({ ...n, lastSeen: new Date(n.lastSeen).toISOString() }));
    },
    routeModel: async (_: unknown, { model }: any) => {
      const n = chooseNodeForModel(model);
      if (!n) return null;
      return { ...n, lastSeen: new Date(n.lastSeen).toISOString() } as any;
    },
  },
  Mutation: {
    registerGatewayNode: async (_: unknown, { id, url, models, capacity }: any) => {
      registerNode(id, url, models, capacity ?? 1);
      return true;
    },
    updateGatewayNode: async (_: unknown, { id, queueDepth, healthy, models, capacity }: any) => {
      updateNode(id, { queueDepth, healthy, models, capacity } as any);
      return true;
    },
    drainGatewayNode: async (_: unknown, { id, drain }: any) => {
      return drainNode(id, drain);
    },
  },
};

export default gatewayResolvers;
