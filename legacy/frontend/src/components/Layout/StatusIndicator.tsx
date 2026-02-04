import React, { useEffect, useState } from 'react';

export interface HealthStatus {
  frontend: boolean;
  core: boolean;
  streaming: boolean;
  lastActivity: Date;
}

/**
 * StatusIndicator - Shows real-time health of backend services
 *
 * Polls every 10 seconds to check:
 * - Frontend server health
 * - Core API health
 * - Recent streaming activity
 */
export function StatusIndicator() {
  const [health, setHealth] = useState<HealthStatus>({
    frontend: true,
    core: false,
    streaming: false,
    lastActivity: new Date(),
  });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      setChecking(true);
      try {
        // Check frontend health
        const frontendOk = await fetch('/health-ui', { signal: AbortSignal.timeout(3000) })
          .then((r) => r.ok)
          .catch(() => false);

        // Check core API health (try multiple endpoints)
        const coreOk = await Promise.race([
          fetch('/api/health', { signal: AbortSignal.timeout(3000) }).then((r) => r.ok),
          fetch('/api/config.json', { signal: AbortSignal.timeout(3000) }).then((r) => r.ok),
        ]).catch(() => false);

        // Check recent activity via ContextLog
        let lastActivity = health.lastActivity;
        let streaming = false;
        try {
          const logsResp = await fetch('/api/contextlog/tail?limit=1', { signal: AbortSignal.timeout(3000) });
          if (logsResp.ok) {
            const logs = await logsResp.json();
            if (logs && logs.length > 0) {
              lastActivity = new Date(logs[0].ts);
              const ageMs = Date.now() - lastActivity.getTime();
              streaming = ageMs < 30000; // Active if within 30 seconds
            }
          }
        } catch (err) {
          // ContextLog endpoint might not exist, that's ok
        }

        setHealth({
          frontend: frontendOk,
          core: coreOk,
          streaming,
          lastActivity,
        });
      } catch (error) {
        console.error('[StatusIndicator] Health check failed:', error);
      } finally {
        setChecking(false);
      }
    };

    // Initial check
    checkHealth();

    // Poll every 10 seconds
    const interval = setInterval(checkHealth, 10000);

    return () => clearInterval(interval);
  }, []); // Empty deps - we don't want to re-run when health changes

  const allHealthy = health.frontend && health.core;
  const statusColor = allHealthy ? 'var(--accent-green)' : health.frontend ? 'var(--accent-yellow)' : 'var(--accent-red)';

  return (
    <div
      className="status-indicator"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--gap-md)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
      }}
    >
      {/* Main status dot */}
      <span
        className={`status-dot ${allHealthy ? 'active' : 'warning'} ${checking ? 'pulse' : ''}`}
        style={{ background: statusColor }}
        title={allHealthy ? 'All systems healthy' : 'Some services unavailable'}
      />

      {/* Status label */}
      <span>
        {checking && 'Checking...'}
        {!checking && allHealthy && 'Healthy'}
        {!checking && !allHealthy && health.frontend && 'Core unavailable'}
        {!checking && !health.frontend && 'Offline'}
      </span>

      {/* Individual service indicators */}
      <div style={{ display: 'flex', gap: 'var(--gap-sm)', fontSize: 'var(--font-xs)' }}>
        <span title="Frontend server" style={{ opacity: health.frontend ? 1 : 0.4 }}>
          🖥️
        </span>
        <span title="Core API" style={{ opacity: health.core ? 1 : 0.4 }}>
          🔌
        </span>
        <span title="Streaming activity" style={{ opacity: health.streaming ? 1 : 0.4 }}>
          📡
        </span>
      </div>
    </div>
  );
}
