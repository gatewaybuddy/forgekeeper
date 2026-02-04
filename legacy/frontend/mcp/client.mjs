/**
 * MCP Client Wrapper (T402)
 *
 * Manages MCP server lifecycle and communication using the Model Context Protocol SDK.
 *
 * Features:
 * - Server process lifecycle management (start, stop, restart)
 * - Multiple transport support (stdio, HTTP, SSE)
 * - Connection health monitoring
 * - Automatic reconnection on failure
 * - Tool discovery and invocation
 * - Resource access
 * - Prompt templating
 *
 * @module mcp/client
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * MCP Server Configuration
 * @typedef {Object} MCPServerConfig
 * @property {string} name - Server name
 * @property {boolean} enabled - Whether server is enabled
 * @property {string} command - Command to execute
 * @property {string[]} args - Command arguments
 * @property {Object<string, string>} env - Environment variables
 * @property {string} [description] - Server description
 * @property {number} [timeout] - Connection timeout in ms (default: 30000)
 */

/**
 * MCP Client wrapper for managing server connections
 */
export class MCPClient extends EventEmitter {
  /**
   * @param {MCPServerConfig} config - Server configuration
   */
  constructor(config) {
    super();

    this.config = config;
    this.name = config.name;
    this.client = null;
    this.transport = null;
    this.process = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 2000; // 2 seconds

    // Server capabilities cache
    this.capabilities = {
      tools: [],
      resources: [],
      prompts: []
    };

    // Statistics
    this.stats = {
      startTime: null,
      toolCalls: 0,
      errors: 0,
      lastError: null
    };
  }

  /**
   * Start the MCP server and connect
   * @returns {Promise<void>}
   */
  async start() {
    if (this.connected) {
      console.log(`[MCP] Server ${this.name} already connected`);
      return;
    }

    try {
      console.log(`[MCP] Starting server: ${this.name}`);

      // Spawn server process
      this.process = spawn(this.config.command, this.config.args, {
        env: { ...process.env, ...this.resolveEnvVars(this.config.env) },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle process errors
      this.process.on('error', (err) => {
        console.error(`[MCP] Process error for ${this.name}:`, err);
        this.handleError(err);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[MCP] Process exited for ${this.name}: code=${code}, signal=${signal}`);
        this.connected = false;
        this.emit('disconnected', { name: this.name, code, signal });

        // Attempt reconnection if not explicitly stopped
        if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => this.reconnect(), this.reconnectDelay);
        }
      });

      // Capture stderr for logging
      this.process.stderr.on('data', (data) => {
        console.error(`[MCP:${this.name}] ${data.toString().trim()}`);
      });

      // Create stdio transport
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.resolveEnvVars(this.config.env)
      });

      // Create MCP client
      this.client = new Client({
        name: `forgekeeper-${this.name}`,
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      });

      // Connect to server
      await this.client.connect(this.transport);

      this.connected = true;
      this.stats.startTime = Date.now();
      this.reconnectAttempts = 0;

      console.log(`[MCP] Connected to server: ${this.name}`);
      this.emit('connected', { name: this.name });

      // Discover capabilities
      await this.discoverCapabilities();

    } catch (err) {
      console.error(`[MCP] Failed to start server ${this.name}:`, err);
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Stop the MCP server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.connected) {
      return;
    }

    try {
      console.log(`[MCP] Stopping server: ${this.name}`);

      // Close client connection
      if (this.client) {
        await this.client.close();
        this.client = null;
      }

      // Kill process
      if (this.process) {
        this.process.kill();
        this.process = null;
      }

      this.connected = false;
      this.transport = null;

      console.log(`[MCP] Stopped server: ${this.name}`);
      this.emit('stopped', { name: this.name });

    } catch (err) {
      console.error(`[MCP] Error stopping server ${this.name}:`, err);
      throw err;
    }
  }

  /**
   * Restart the MCP server
   * @returns {Promise<void>}
   */
  async restart() {
    console.log(`[MCP] Restarting server: ${this.name}`);
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
    await this.start();
  }

  /**
   * Attempt to reconnect after failure
   * @private
   */
  async reconnect() {
    this.reconnectAttempts++;
    console.log(`[MCP] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} for ${this.name}`);

    try {
      await this.start();
    } catch (err) {
      console.error(`[MCP] Reconnect failed for ${this.name}:`, err);

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(`[MCP] Max reconnect attempts reached for ${this.name}`);
        this.emit('max-reconnects', { name: this.name });
      }
    }
  }

  /**
   * Discover server capabilities (tools, resources, prompts)
   * @private
   */
  async discoverCapabilities() {
    if (!this.client || !this.connected) {
      throw new Error(`Server ${this.name} not connected`);
    }

    try {
      // Discover tools
      const toolsResult = await this.client.listTools();
      this.capabilities.tools = toolsResult.tools || [];
      console.log(`[MCP] Discovered ${this.capabilities.tools.length} tools from ${this.name}`);

      // Discover resources
      const resourcesResult = await this.client.listResources();
      this.capabilities.resources = resourcesResult.resources || [];
      console.log(`[MCP] Discovered ${this.capabilities.resources.length} resources from ${this.name}`);

      // Discover prompts
      const promptsResult = await this.client.listPrompts();
      this.capabilities.prompts = promptsResult.prompts || [];
      console.log(`[MCP] Discovered ${this.capabilities.prompts.length} prompts from ${this.name}`);

      this.emit('capabilities-discovered', {
        name: this.name,
        capabilities: this.capabilities
      });

    } catch (err) {
      console.error(`[MCP] Error discovering capabilities for ${this.name}:`, err);
      // Non-fatal - server might not support all capability types
    }
  }

  /**
   * Call a tool on the MCP server
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool result
   */
  async callTool(toolName, args = {}) {
    if (!this.client || !this.connected) {
      throw new Error(`Server ${this.name} not connected`);
    }

    try {
      this.stats.toolCalls++;

      console.log(`[MCP:${this.name}] Calling tool: ${toolName}`);
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      this.emit('tool-called', {
        server: this.name,
        tool: toolName,
        args,
        result
      });

      return result;

    } catch (err) {
      console.error(`[MCP:${this.name}] Tool call failed (${toolName}):`, err);
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Read a resource from the MCP server
   * @param {string} uri - Resource URI
   * @returns {Promise<Object>} Resource content
   */
  async readResource(uri) {
    if (!this.client || !this.connected) {
      throw new Error(`Server ${this.name} not connected`);
    }

    try {
      console.log(`[MCP:${this.name}] Reading resource: ${uri}`);
      const result = await this.client.readResource({ uri });

      this.emit('resource-read', {
        server: this.name,
        uri,
        result
      });

      return result;

    } catch (err) {
      console.error(`[MCP:${this.name}] Resource read failed (${uri}):`, err);
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Get a prompt template from the MCP server
   * @param {string} promptName - Prompt name
   * @param {Object} args - Prompt arguments
   * @returns {Promise<Object>} Prompt result
   */
  async getPrompt(promptName, args = {}) {
    if (!this.client || !this.connected) {
      throw new Error(`Server ${this.name} not connected`);
    }

    try {
      console.log(`[MCP:${this.name}] Getting prompt: ${promptName}`);
      const result = await this.client.getPrompt({
        name: promptName,
        arguments: args
      });

      this.emit('prompt-retrieved', {
        server: this.name,
        prompt: promptName,
        args,
        result
      });

      return result;

    } catch (err) {
      console.error(`[MCP:${this.name}] Prompt retrieval failed (${promptName}):`, err);
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Get list of available tools
   * @returns {Array} Tool definitions
   */
  getTools() {
    return this.capabilities.tools;
  }

  /**
   * Get list of available resources
   * @returns {Array} Resource definitions
   */
  getResources() {
    return this.capabilities.resources;
  }

  /**
   * Get list of available prompts
   * @returns {Array} Prompt definitions
   */
  getPrompts() {
    return this.capabilities.prompts;
  }

  /**
   * Check if server is connected and healthy
   * @returns {Promise<boolean>} Health status
   */
  async checkHealth() {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      // Try to list tools as a health check
      await this.client.listTools();
      return true;
    } catch (err) {
      console.error(`[MCP] Health check failed for ${this.name}:`, err);
      return false;
    }
  }

  /**
   * Get server statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      connected: this.connected,
      toolCount: this.capabilities.tools.length,
      resourceCount: this.capabilities.resources.length,
      promptCount: this.capabilities.prompts.length
    };
  }

  /**
   * Resolve environment variables with ${VAR} syntax
   * @private
   * @param {Object<string, string>} env - Environment variables
   * @returns {Object<string, string>} Resolved environment variables
   */
  resolveEnvVars(env) {
    const resolved = {};

    for (const [key, value] of Object.entries(env || {})) {
      // Replace ${VAR} with process.env.VAR
      resolved[key] = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return process.env[varName] || '';
      });
    }

    return resolved;
  }

  /**
   * Handle errors and update statistics
   * @private
   * @param {Error} err - Error object
   */
  handleError(err) {
    this.stats.errors++;
    this.stats.lastError = {
      message: err.message,
      timestamp: Date.now()
    };

    this.emit('error', {
      server: this.name,
      error: err
    });
  }
}

/**
 * Create and start an MCP client
 * @param {MCPServerConfig} config - Server configuration
 * @returns {Promise<MCPClient>} Started MCP client
 */
export async function createMCPClient(config) {
  const client = new MCPClient(config);
  await client.start();
  return client;
}
