import type { ForgekeeperConfig } from '../types/config';

let cachedConfig: ForgekeeperConfig | null = null;
let configPromise: Promise<ForgekeeperConfig> | null = null;

/**
 * Fetch the Forgekeeper configuration from /config.json.
 * Results are cached to avoid repeated fetches.
 */
export async function fetchConfig(): Promise<ForgekeeperConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Return in-flight promise if already fetching
  if (configPromise) {
    return configPromise;
  }

  // Fetch config
  configPromise = (async () => {
    try {
      const response = await fetch('/config.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status}`);
      }
      const config = await response.json() as ForgekeeperConfig;
      cachedConfig = config;
      return config;
    } catch (error) {
      // Clear promise on error so retry is possible
      configPromise = null;
      throw error;
    }
  })();

  return configPromise;
}

/**
 * Clear cached config (useful for testing or forcing refresh)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  configPromise = null;
}
