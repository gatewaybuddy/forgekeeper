import fs from 'fs';
import path from 'path';

const runtimeConfigResolvers = {
  Query: {
    getRuntimeConfig: async () => {
      try {
        const p = path.join(process.cwd(), '.forgekeeper', 'runtime_config.json');
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      } catch {
        return {};
      }
    },
  },
  Mutation: {
    setRuntimeConfig: async (_: unknown, { patch }: any) => {
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
  },
};

export default runtimeConfigResolvers;
