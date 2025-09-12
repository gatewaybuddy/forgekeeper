export type NodeInfo = {
  id: string;
  url: string;
  models: string[];
  capacity: number; // relative capacity (e.g., GPUs)
  queueDepth: number;
  healthy: boolean;
  drain: boolean;
  lastSeen: number;
};

const REGISTRY = new Map<string, NodeInfo>();

export function registerNode(id: string, url: string, models: string[], capacity = 1): NodeInfo {
  const now = Date.now();
  const existing = REGISTRY.get(id);
  const info: NodeInfo = {
    id,
    url,
    models,
    capacity: capacity > 0 ? capacity : 1,
    queueDepth: existing?.queueDepth ?? 0,
    healthy: true,
    drain: existing?.drain ?? false,
    lastSeen: now,
  };
  REGISTRY.set(id, info);
  return info;
}

export function updateNode(id: string, patch: Partial<Pick<NodeInfo, 'models'|'queueDepth'|'healthy'|'capacity'|'drain'>>): NodeInfo | null {
  const cur = REGISTRY.get(id);
  if (!cur) return null;
  const next: NodeInfo = { ...cur, ...patch, lastSeen: Date.now() } as NodeInfo;
  if (next.capacity <= 0) next.capacity = 1;
  REGISTRY.set(id, next);
  return next;
}

export function listNodes(): NodeInfo[] {
  return Array.from(REGISTRY.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function drainNode(id: string, drain: boolean): boolean {
  const cur = REGISTRY.get(id);
  if (!cur) return false;
  cur.drain = drain;
  cur.lastSeen = Date.now();
  REGISTRY.set(id, cur);
  return true;
}

export function chooseNodeForModel(model: string): NodeInfo | null {
  const candidates = listNodes().filter(n => n.healthy && !n.drain && n.models.includes(model));
  if (candidates.length === 0) return null;
  // Weighted score: higher capacity and lower queueDepth preferred
  let best: NodeInfo | null = null;
  let bestScore = -Infinity;
  for (const n of candidates) {
    const score = n.capacity / (1 + Math.max(0, n.queueDepth));
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best;
}

export function metrics() {
  const nodes = listNodes();
  const total = nodes.length;
  const healthy = nodes.filter(n => n.healthy).length;
  const draining = nodes.filter(n => n.drain).length;
  const avgQueue = nodes.length ? nodes.reduce((s, n) => s + Math.max(0, n.queueDepth), 0) / nodes.length : 0;
  return { total, healthy, draining, avgQueue };
}

