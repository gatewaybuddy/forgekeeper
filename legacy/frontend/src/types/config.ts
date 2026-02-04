// Forgekeeper configuration types

export interface ForgekeeperConfig {
  apiBase: string;
  model: string;
  useHarmony: boolean;
  harmonyToolsEnabled: boolean;
  reviewEnabled: boolean;
  chunkedEnabled: boolean;
  tools: {
    enabled: boolean;
    count: number;
    names: string[];
    powershellEnabled: boolean;
    bashEnabled: boolean;
    httpFetchEnabled: boolean;
    selfUpdateEnabled: boolean;
    allow: string;
    cwd: string | null;
    storage: {
      path: string;
      bindMounted: boolean;
    };
    repo: {
      root: string;
      bindMounted: boolean;
    };
    repoWrite: {
      enabled: boolean;
      root: string;
      allowed: string[];
      maxBytes: number;
    };
    httpFetch: {
      enabled: boolean;
      maxBytes: number;
      timeoutMs: number;
    };
  };
}

export interface ModePreferences {
  reviewEnabled: boolean;
  chunkedEnabled: boolean;
}

export interface ProgressUpdate {
  mode: 'review' | 'chunked';
  current: number;
  total: number;
  label?: string;
}
