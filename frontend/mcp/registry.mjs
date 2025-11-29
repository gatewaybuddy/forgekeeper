/**
 * MCP Server Registry (T403)
 *
 * Centralized management of all MCP server connections.
 *
 * Features:
 * - Load servers from configuration file
 * - Auto-discovery of installed MCP packages
 * - Hot-reload on configuration changes
 * - Lifecycle management (start/stop/restart all servers)
 * - Health monitoring
 * - Aggregated tool/resource/prompt discovery
 *
 * @module mcp/registry
 */

import { MCPClient, createMCPClient } from './client.mjs';
import { readFile, access, watch } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * MCP Server Registry
 *
 * Manages multiple MCP server instances
 */
export class MCPRegistry extends EventEmitter {
  constructor(configPath = null) {
    super();

    this.configPath = configPath || process.env.MCP_SERVERS_CONFIG || '.forgekeeper/mcp-servers.json';
    this.servers = new Map(); // name -> MCPClient
    this.config = null;
    this.watching = false;
    this.watcher = null;

    // Aggregated capabilities
    this.allTools = new Map(); // toolName -> { server, definition }
    this.allResources = new Map(); // resourceUri -> { server, definition }
    this.allPrompts = new Map(); // promptName -> { server, definition }

    // Configuration
    this.autoReload = process.env.MCP_AUTO_RELOAD !== '0'; // Default: enabled
    this.healthCheckInterval = parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL || '60000', 10); // 60s
    this.healthCheckTimer = null;
  }

  /**
   * Initialize registry and load servers
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log('[MCP Registry] Initializing...');

    try {
      // Load configuration
      await this.loadConfig();

      // Start enabled servers
      await this.startAllServers();

      // Start health monitoring
      this.startHealthMonitoring();

      // Watch for config changes
      if (this.autoReload) {
        await this.watchConfig();
      }

      console.log(`[MCP Registry] Initialized with ${this.servers.size} servers`);
      this.emit('initialized', { serverCount: this.servers.size });

    } catch (err) {
      console.error('[MCP Registry] Initialization failed:', err);
      throw err;
    }
  }

  /**
   * Load configuration from file
   * @private
   */
  async loadConfig() {
    try {
      // Check if config file exists
      await access(this.configPath, constants.R_OK);

      const content = await readFile(this.configPath, 'utf8');
      this.config = JSON.parse(content);

      console.log(`[MCP Registry] Loaded config from: ${this.configPath}`);
      console.log(`[MCP Registry] Found ${Object.keys(this.config.servers || {}).length} server definitions`);

      return this.config;

    } catch (err) {
      if (err.code === 'ENOENT') {
        console.warn(`[MCP Registry] Config file not found: ${this.configPath}`);
        this.config = { servers: {}, defaults: {} };
        return this.config;
      }

      console.error('[MCP Registry] Failed to load config:', err);
      throw err;
    }
  }

  /**
   * Reload configuration and restart servers
   */
  async reloadConfig() {
    console.log('[MCP Registry] Reloading configuration...');

    try {
      // Stop all servers
      await this.stopAllServers();

      // Reload config
      await this.loadConfig();

      // Start enabled servers
      await this.startAllServers();

      console.log('[MCP Registry] Configuration reloaded');
      this.emit('config-reloaded', { serverCount: this.servers.size });

    } catch (err) {
      console.error('[MCP Registry] Config reload failed:', err);
      throw err;
    }
  }

  /**
   * Watch configuration file for changes
   * @private
   */
  async watchConfig() {
    if (this.watching) {
      return;
    }

    try {
      const configDir = path.dirname(this.configPath);
      const configFile = path.basename(this.configPath);

      // Watch the directory (more reliable than watching the file directly)
      this.watcher = watch(configDir);

      console.log(`[MCP Registry] Watching config: ${this.configPath}`);
      this.watching = true;

      // Handle changes
      (async () => {
        for await (const event of this.watcher) {
          if (event.filename === configFile) {
            console.log('[MCP Registry] Config file changed, reloading...');

            // Debounce: wait 500ms for file write to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
              await this.reloadConfig();
            } catch (err) {
              console.error('[MCP Registry] Auto-reload failed:', err);
            }
          }
        }
      })();

    } catch (err) {
      console.error('[MCP Registry] Failed to watch config:', err);
    }
  }

  /**
   * Start all enabled servers
   * @private
   */
  async startAllServers() {
    if (!this.config || !this.config.servers) {
      console.log('[MCP Registry] No servers configured');
      return;
    }

    const serverConfigs = Object.entries(this.config.servers);
    const startPromises = [];

    for (const [name, config] of serverConfigs) {
      // Skip disabled servers
      if (config.enabled === false) {
        console.log(`[MCP Registry] Skipping disabled server: ${name}`);
        continue;
      }

      // Start server
      const promise = this.startServer(name, { ...config, name });
      startPromises.push(promise.catch(err => {
        console.error(`[MCP Registry] Failed to start server ${name}:`, err);
        return null; // Don't fail entire batch
      }));
    }

    const results = await Promise.all(startPromises);
    const successCount = results.filter(r => r !== null).length;

    console.log(`[MCP Registry] Started ${successCount}/${serverConfigs.length} servers`);
  }

  /**
   * Start a single MCP server
   * @param {string} name - Server name
   * @param {Object} config - Server configuration
   * @returns {Promise<MCPClient>} Started client
   */
  async startServer(name, config) {
    if (this.servers.has(name)) {
      console.log(`[MCP Registry] Server ${name} already running`);
      return this.servers.get(name);
    }

    try {
      // Apply defaults
      const fullConfig = {
        ...this.config.defaults,
        ...config,
        name
      };

      console.log(`[MCP Registry] Starting server: ${name}`);
      const client = await createMCPClient(fullConfig);

      // Register event handlers
      this.registerClientHandlers(client);

      // Store client
      this.servers.set(name, client);

      // Update aggregated capabilities
      await this.updateCapabilities(name, client);

      console.log(`[MCP Registry] Server ${name} started successfully`);
      this.emit('server-started', { name });

      return client;

    } catch (err) {
      console.error(`[MCP Registry] Failed to start server ${name}:`, err);
      throw err;
    }
  }

  /**
   * Stop a single MCP server
   * @param {string} name - Server name
   */
  async stopServer(name) {
    const client = this.servers.get(name);

    if (!client) {
      console.log(`[MCP Registry] Server ${name} not found`);
      return;
    }

    try {
      console.log(`[MCP Registry] Stopping server: ${name}`);
      await client.stop();

      // Remove from registry
      this.servers.delete(name);

      // Update aggregated capabilities
      this.removeCapabilities(name);

      console.log(`[MCP Registry] Server ${name} stopped`);
      this.emit('server-stopped', { name });

    } catch (err) {
      console.error(`[MCP Registry] Failed to stop server ${name}:`, err);
      throw err;
    }
  }

  /**
   * Restart a single MCP server
   * @param {string} name - Server name
   */
  async restartServer(name) {
    console.log(`[MCP Registry] Restarting server: ${name}`);

    await this.stopServer(name);

    // Get config for this server
    const config = this.config?.servers?.[name];
    if (!config) {
      throw new Error(`Server ${name} not found in configuration`);
    }

    await this.startServer(name, config);
  }

  /**
   * Stop all MCP servers
   */
  async stopAllServers() {
    console.log(`[MCP Registry] Stopping all servers (${this.servers.size})`);

    const stopPromises = [];
    for (const [name, client] of this.servers.entries()) {
      const promise = client.stop().catch(err => {
        console.error(`[MCP Registry] Failed to stop server ${name}:`, err);
      });
      stopPromises.push(promise);
    }

    await Promise.all(stopPromises);

    this.servers.clear();
    this.allTools.clear();
    this.allResources.clear();
    this.allPrompts.clear();

    console.log('[MCP Registry] All servers stopped');
    this.emit('all-stopped');
  }

  /**
   * Register event handlers for a client
   * @private
   */
  registerClientHandlers(client) {
    client.on('error', (data) => {
      this.emit('server-error', data);
    });

    client.on('disconnected', async (data) => {
      this.emit('server-disconnected', data);

      // Remove from registry if permanently disconnected
      if (data.code !== 0) {
        setTimeout(() => {
          if (!client.connected) {
            this.servers.delete(data.name);
            this.removeCapabilities(data.name);
          }
        }, 10000); // Wait 10s before removing
      }
    });

    client.on('capabilities-discovered', (data) => {
      this.emit('capabilities-discovered', data);
    });
  }

  /**
   * Update aggregated capabilities from a server
   * @private
   */
  async updateCapabilities(serverName, client) {
    // Add tools
    for (const tool of client.getTools()) {
      const key = `${serverName}:${tool.name}`;
      this.allTools.set(key, {
        server: serverName,
        definition: tool
      });
    }

    // Add resources
    for (const resource of client.getResources()) {
      const key = `${serverName}:${resource.uri}`;
      this.allResources.set(key, {
        server: serverName,
        definition: resource
      });
    }

    // Add prompts
    for (const prompt of client.getPrompts()) {
      const key = `${serverName}:${prompt.name}`;
      this.allPrompts.set(key, {
        server: serverName,
        definition: prompt
      });
    }

    console.log(`[MCP Registry] Updated capabilities for ${serverName}: ${client.getTools().length} tools, ${client.getResources().length} resources, ${client.getPrompts().length} prompts`);
  }

  /**
   * Remove capabilities for a server
   * @private
   */
  removeCapabilities(serverName) {
    // Remove tools
    for (const [key, value] of this.allTools.entries()) {
      if (value.server === serverName) {
        this.allTools.delete(key);
      }
    }

    // Remove resources
    for (const [key, value] of this.allResources.entries()) {
      if (value.server === serverName) {
        this.allResources.delete(key);
      }
    }

    // Remove prompts
    for (const [key, value] of this.allPrompts.entries()) {
      if (value.server === serverName) {
        this.allPrompts.delete(key);
      }
    }
  }

  /**
   * Start health monitoring for all servers
   * @private
   */
  startHealthMonitoring() {
    if (this.healthCheckTimer) {
      return;
    }

    console.log(`[MCP Registry] Starting health monitoring (interval: ${this.healthCheckInterval}ms)`);

    this.healthCheckTimer = setInterval(async () => {
      for (const [name, client] of this.servers.entries()) {
        const healthy = await client.checkHealth();

        if (!healthy) {
          console.warn(`[MCP Registry] Server ${name} unhealthy, attempting restart...`);
          try {
            await this.restartServer(name);
          } catch (err) {
            console.error(`[MCP Registry] Failed to restart ${name}:`, err);
          }
        }
      }
    }, this.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   * @private
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      console.log('[MCP Registry] Stopped health monitoring');
    }
  }

  /**
   * Get a server client by name
   * @param {string} name - Server name
   * @returns {MCPClient|null} Client instance or null
   */
  getServer(name) {
    return this.servers.get(name) || null;
  }

  /**
   * Get all server names
   * @returns {string[]} Server names
   */
  getServerNames() {
    return Array.from(this.servers.keys());
  }

  /**
   * Get all tools from all servers
   * @returns {Array} Tool definitions with server info
   */
  getAllTools() {
    return Array.from(this.allTools.values());
  }

  /**
   * Get all resources from all servers
   * @returns {Array} Resource definitions with server info
   */
  getAllResources() {
    return Array.from(this.allResources.values());
  }

  /**
   * Get all prompts from all servers
   * @returns {Array} Prompt definitions with server info
   */
  getAllPrompts() {
    return Array.from(this.allPrompts.values());
  }

  /**
   * Find server that provides a specific tool
   * @param {string} toolName - Tool name
   * @returns {string|null} Server name or null
   */
  findServerForTool(toolName) {
    for (const [key, value] of this.allTools.entries()) {
      if (value.definition.name === toolName) {
        return value.server;
      }
    }
    return null;
  }

  /**
   * Get registry statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const serverStats = [];
    for (const [name, client] of this.servers.entries()) {
      serverStats.push({
        name,
        ...client.getStats()
      });
    }

    return {
      serverCount: this.servers.size,
      toolCount: this.allTools.size,
      resourceCount: this.allResources.size,
      promptCount: this.allPrompts.size,
      servers: serverStats
    };
  }

  /**
   * Shutdown the registry
   */
  async shutdown() {
    console.log('[MCP Registry] Shutting down...');

    // Stop watching config
    if (this.watcher) {
      this.watcher.return();
      this.watching = false;
    }

    // Stop health monitoring
    this.stopHealthMonitoring();

    // Stop all servers
    await this.stopAllServers();

    console.log('[MCP Registry] Shutdown complete');
    this.emit('shutdown');
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get or create the singleton registry instance
 * @param {string} [configPath] - Optional config path
 * @returns {MCPRegistry} Registry instance
 */
export function getRegistry(configPath = null) {
  if (!registryInstance) {
    registryInstance = new MCPRegistry(configPath);
  }
  return registryInstance;
}

/**
 * Initialize the registry
 * @param {string} [configPath] - Optional config path
 * @returns {Promise<MCPRegistry>} Initialized registry
 */
export async function initializeRegistry(configPath = null) {
  const registry = getRegistry(configPath);
  await registry.initialize();
  return registry;
}
