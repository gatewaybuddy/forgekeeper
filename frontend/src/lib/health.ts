export async function checkHealth(healthzUrl: string, healthUrl: string, intervalMs = 1000, attempts = 10): Promise<boolean> {
  const tryOnce = async () => {
    for (const url of [healthzUrl, healthUrl]) {
      try {
        const resp = await fetch(url, { method: 'GET' });
        if (resp.ok) return true;
      } catch {
        // ignore
      }
    }
    return false;
  };
  for (let i = 0; i < attempts; i++) {
    const ok = await tryOnce();
    if (ok) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

