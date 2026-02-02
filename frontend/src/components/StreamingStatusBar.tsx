import React, { useEffect, useState } from 'react';
import '../styles/design-system.css';
import '../styles/layout.css';

export interface StreamingStatus {
  status: 'active' | 'idle' | 'error';
  lastActivity: Date;
  latestLog?: string;
  containerHealth: {
    frontend: boolean;
    core: boolean;
  };
}

/**
 * StreamingStatusBar - Real-time backend activity monitor
 *
 * Displays:
 * - Health status of frontend and core services
 * - Last activity timestamp
 * - Latest log message (if available)
 * - Visual indicators for process health
 *
 * Updates every 10 seconds to ensure user knows backend is alive.
 */
export function StreamingStatusBar() {
  const [status, setStatus] = useState<StreamingStatus>({
    status: 'idle',
    lastActivity: new Date(),
    containerHealth: { frontend: true, core: true },
  });

  useEffect(() => {
    const checkHealth = async () => {
      try {
        // Check frontend health
        const frontendOk = await fetch('/health-ui', { signal: AbortSignal.timeout(3000) })
          .then((r) => r.ok)
          .catch(() => false);

        // Check core API health
        const coreOk = await fetch('/api/health', { signal: AbortSignal.timeout(3000) })
          .then((r) => r.ok)
          .catch(() => false);

        // Check last ContextLog activity
        let lastActivity = status.lastActivity;
        let currentStatus: 'active' | 'idle' | 'error' = 'idle';
        let latestLog: string | undefined;

        try {
          const logsResp = await fetch('/api/contextlog/tail?limit=1', { signal: AbortSignal.timeout(3000) });
          if (logsResp.ok) {
            const logs = await logsResp.json();
            if (logs && Array.isArray(logs) && logs.length > 0) {
              const log = logs[0];
              lastActivity = new Date(log.ts || log.timestamp || Date.now());

              // Extract meaningful log message
              if (log.name) {
                latestLog = `${log.actor || 'system'}: ${log.name}`;
              } else if (log.act) {
                latestLog = `${log.actor || 'system'} ${log.act}`;
              }

              // If activity within 30s, mark as active
              const ageMs = Date.now() - lastActivity.getTime();
              currentStatus = ageMs < 30000 ? 'active' : 'idle';
            }
          }
        } catch (err) {
          // ContextLog might not be available, that's ok
        }

        // If any service is down, mark as error
        if (!frontendOk || !coreOk) {
          currentStatus = 'error';
        }

        setStatus({
          status: currentStatus,
          lastActivity,
          latestLog,
          containerHealth: { frontend: frontendOk, core: coreOk },
        });
      } catch (error) {
        setStatus((prev) => ({
          ...prev,
          status: 'error',
        }));
      }
    };

    // Initial check
    checkHealth();

    // Poll every 10 seconds
    const interval = setInterval(checkHealth, 10000);

    return () => clearInterval(interval);
  }, []); // Empty deps to avoid infinite loop

  const timeSinceActivity = Date.now() - status.lastActivity.getTime();
  const idleMinutes = Math.floor(timeSinceActivity / 60000);
  const idleSeconds = Math.floor((timeSinceActivity % 60000) / 1000);

  return (
    <div className={`streaming-status ${status.status}`}>
      {/* Service health indicators */}
      <div className="status-indicators">
        <div className="status-indicator">
          <span className={`status-dot ${status.containerHealth.frontend ? 'active' : 'error'}`} />
          <span>Frontend</span>
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${status.containerHealth.core ? 'active' : 'error'}`} />
          <span>Core API</span>
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${status.status === 'active' ? 'active' : 'inactive'}`} />
          <span>Activity</span>
        </div>
      </div>

      {/* Status message */}
      <div className="status-message">
        {status.status === 'active' && (
          <>
            ✅ Streaming active
            {status.latestLog && (
              <span
                style={{
                  marginLeft: 'var(--gap-sm)',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--font-xs)',
                }}
              >
                ({status.latestLog.slice(0, 40)}{status.latestLog.length > 40 ? '...' : ''})
              </span>
            )}
          </>
        )}
        {status.status === 'idle' && (
          <>
            ⏸️ Idle for {idleMinutes > 0 ? `${idleMinutes}m ${idleSeconds}s` : `${idleSeconds}s`}
          </>
        )}
        {status.status === 'error' && (
          <>
            ❌ Connection error
            {!status.containerHealth.frontend && ' (Frontend down)'}
            {status.containerHealth.frontend && !status.containerHealth.core && ' (Core API down)'}
          </>
        )}
      </div>
    </div>
  );
}
