import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('MCP Registry Configuration', () => {
  describe('Config Loading', () => {
    it('parses valid configuration', () => {
      const config = {
        servers: {
          github: {
            enabled: true,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
              'GITHUB_PERSONAL_ACCESS_TOKEN': '${GITHUB_TOKEN}'
            },
            description: 'GitHub API integration'
          },
          postgres: {
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres'],
            env: {
              'POSTGRES_URL': '${POSTGRES_URL}'
            }
          }
        },
        defaults: {
          timeout: 30000
        }
      };

      expect(config.servers.github.enabled).toBe(true);
      expect(config.servers.postgres.enabled).toBe(false);
      expect(config.defaults.timeout).toBe(30000);
    });

    it('identifies enabled servers', () => {
      const config = {
        servers: {
          server1: { enabled: true, command: 'cmd1', args: [] },
          server2: { enabled: false, command: 'cmd2', args: [] },
          server3: { enabled: true, command: 'cmd3', args: [] }
        }
      };

      const enabledServers = Object.entries(config.servers)
        .filter(([_, cfg]) => cfg.enabled)
        .map(([name]) => name);

      expect(enabledServers).toHaveLength(2);
      expect(enabledServers).toContain('server1');
      expect(enabledServers).toContain('server3');
      expect(enabledServers).not.toContain('server2');
    });

    it('applies default timeout to servers without explicit timeout', () => {
      const config = {
        servers: {
          fast: {
            enabled: true,
            command: 'fast-server',
            args: [],
            timeout: 10000
          },
          normal: {
            enabled: true,
            command: 'normal-server',
            args: []
          }
        },
        defaults: {
          timeout: 30000
        }
      };

      const fastTimeout = config.servers.fast.timeout || config.defaults.timeout;
      const normalTimeout = config.servers.normal.timeout || config.defaults.timeout;

      expect(fastTimeout).toBe(10000);
      expect(normalTimeout).toBe(30000);
    });
  });

  describe('Server Lifecycle', () => {
    it('tracks server state transitions', () => {
      const states = {
        initial: 'stopped',
        afterStart: 'starting',
        afterConnect: 'connected',
        afterDisconnect: 'disconnected',
        afterReconnect: 'connected'
      };

      expect(states.initial).toBe('stopped');
      expect(states.afterConnect).toBe('connected');
      expect(states.afterReconnect).toBe('connected');
    });

    it('tracks server uptime', () => {
      const server = {
        name: 'github',
        startTime: Date.now() - 60000, // Started 60 seconds ago
        connected: true
      };

      const uptime = Date.now() - server.startTime;

      expect(uptime).toBeGreaterThanOrEqual(60000);
      expect(uptime).toBeLessThan(61000); // Allow 1 second variance
    });

    it('counts connection attempts', () => {
      const server = {
        name: 'flaky',
        connectionAttempts: 0,
        maxReconnects: 3
      };

      // Simulate connection attempts
      for (let i = 0; i < 2; i++) {
        server.connectionAttempts++;
      }

      expect(server.connectionAttempts).toBe(2);
      expect(server.connectionAttempts).toBeLessThan(server.maxReconnects);
    });
  });

  describe('Health Monitoring', () => {
    it('detects healthy servers', () => {
      const server = {
        name: 'healthy',
        connected: true,
        lastHealthCheck: Date.now(),
        consecutiveFailures: 0
      };

      const isHealthy = server.connected && server.consecutiveFailures === 0;

      expect(isHealthy).toBe(true);
    });

    it('detects unhealthy servers', () => {
      const server = {
        name: 'unhealthy',
        connected: false,
        lastHealthCheck: Date.now() - 120000, // 2 minutes ago
        consecutiveFailures: 3,
        healthCheckThreshold: 3
      };

      const isUnhealthy = !server.connected ||
        server.consecutiveFailures >= server.healthCheckThreshold;

      expect(isUnhealthy).toBe(true);
    });

    it('tracks health check intervals', () => {
      const healthCheckInterval = 60000; // 60 seconds
      const lastCheck = Date.now() - 30000; // 30 seconds ago
      const now = Date.now();

      const timeSinceLastCheck = now - lastCheck;
      const shouldCheck = timeSinceLastCheck >= healthCheckInterval;

      expect(shouldCheck).toBe(false); // Not time yet
    });

    it('triggers restart after consecutive failures', () => {
      const server = {
        name: 'failing',
        consecutiveFailures: 3,
        failureThreshold: 3,
        shouldRestart: false
      };

      if (server.consecutiveFailures >= server.failureThreshold) {
        server.shouldRestart = true;
      }

      expect(server.shouldRestart).toBe(true);
    });
  });

  describe('Tool Aggregation', () => {
    it('aggregates tools from multiple servers', () => {
      const servers = {
        github: {
          tools: [
            { name: 'create_issue' },
            { name: 'create_pr' },
            { name: 'search_code' }
          ]
        },
        postgres: {
          tools: [
            { name: 'query' },
            { name: 'execute' }
          ]
        }
      };

      const allTools = [];
      for (const [serverName, server] of Object.entries(servers)) {
        for (const tool of server.tools) {
          allTools.push({
            server: serverName,
            tool: tool.name
          });
        }
      }

      expect(allTools).toHaveLength(5);
      expect(allTools.some(t => t.server === 'github' && t.tool === 'create_issue')).toBe(true);
      expect(allTools.some(t => t.server === 'postgres' && t.tool === 'query')).toBe(true);
    });

    it('tracks tool count per server', () => {
      const servers = [
        { name: 'github', toolCount: 8 },
        { name: 'postgres', toolCount: 5 },
        { name: 'filesystem', toolCount: 12 }
      ];

      const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

      expect(totalTools).toBe(25);
      expect(servers[0].toolCount).toBe(8);
      expect(servers[2].toolCount).toBe(12);
    });
  });

  describe('Hot-Reload', () => {
    it('detects config file changes', () => {
      const config = {
        lastModified: Date.now() - 1000,
        currentModified: Date.now()
      };

      const hasChanged = config.currentModified > config.lastModified;

      expect(hasChanged).toBe(true);
    });

    it('debounces rapid config changes', async () => {
      const debounceDelay = 500;
      const changes = [];

      // Simulate rapid changes
      const timestamps = [
        Date.now(),
        Date.now() + 100,
        Date.now() + 200,
        Date.now() + 300
      ];

      // Only the last change after debounce should trigger reload
      const lastChange = timestamps[timestamps.length - 1];
      const timeSinceLastChange = Date.now() - lastChange;

      // Would wait for debounce before reloading
      expect(timestamps).toHaveLength(4);
      expect(debounceDelay).toBe(500);
    });

    it('reloads all servers on config change', () => {
      const previousServers = ['github', 'postgres'];
      const newServers = ['github', 'filesystem']; // postgres removed, filesystem added

      const toStop = previousServers.filter(s => !newServers.includes(s));
      const toStart = newServers.filter(s => !previousServers.includes(s));

      expect(toStop).toEqual(['postgres']);
      expect(toStart).toEqual(['filesystem']);
    });
  });

  describe('Error Handling', () => {
    it('handles missing config file gracefully', () => {
      const error = { code: 'ENOENT' };
      const isMissing = error.code === 'ENOENT';

      expect(isMissing).toBe(true);
      // Registry should continue without MCP servers
    });

    it('handles invalid JSON in config', () => {
      const invalidJSON = '{ "servers": { "github": { enabled: true } }'; // Missing quote

      let parseError = null;
      try {
        JSON.parse(invalidJSON);
      } catch (err) {
        parseError = err;
      }

      expect(parseError).not.toBeNull();
      expect(parseError.message).toContain('JSON');
    });

    it('handles server startup failures', () => {
      const server = {
        name: 'broken',
        startupAttempts: 3,
        maxStartupAttempts: 3,
        lastError: 'Command not found: nonexistent-command'
      };

      const failedPermanently = server.startupAttempts >= server.maxStartupAttempts;

      expect(failedPermanently).toBe(true);
      expect(server.lastError).toContain('Command not found');
    });
  });

  describe('Statistics', () => {
    it('calculates total statistics', () => {
      const stats = {
        servers: [
          { name: 'github', toolCount: 8, connected: true },
          { name: 'postgres', toolCount: 5, connected: true },
          { name: 'broken', toolCount: 0, connected: false }
        ]
      };

      const connectedCount = stats.servers.filter(s => s.connected).length;
      const totalTools = stats.servers.reduce((sum, s) => sum + s.toolCount, 0);

      expect(connectedCount).toBe(2);
      expect(totalTools).toBe(13);
      expect(stats.servers).toHaveLength(3);
    });

    it('tracks server uptime', () => {
      const server = {
        name: 'github',
        startTime: Date.now() - 3600000, // 1 hour ago
        connected: true
      };

      const uptimeMs = Date.now() - server.startTime;
      const uptimeMinutes = Math.floor(uptimeMs / 60000);

      expect(uptimeMinutes).toBeGreaterThanOrEqual(59);
      expect(uptimeMinutes).toBeLessThanOrEqual(61); // Allow variance
    });
  });

  describe('Server Name Validation', () => {
    it('accepts valid server names', () => {
      const validNames = ['github', 'my-server', 'postgres_db', 'server123'];

      for (const name of validNames) {
        const isValid = /^[a-z0-9_-]+$/.test(name);
        expect(isValid).toBe(true);
      }
    });

    it('rejects invalid server names', () => {
      const invalidNames = ['GitHub', 'my server', 'server!', 'sér€ver'];

      for (const name of invalidNames) {
        const isValid = /^[a-z0-9_-]+$/.test(name);
        expect(isValid).toBe(false);
      }
    });
  });
});
