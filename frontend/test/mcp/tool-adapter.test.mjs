import { describe, it, expect, vi } from 'vitest';
import {
  mcpToolToForgekeeper,
  convertMCPTools,
  isMCPTool,
  getMCPMetadata
} from '../../mcp/tool-adapter.mjs';

describe('MCP Tool Adapter', () => {
  describe('mcpToolToForgekeeper', () => {
    it('converts basic MCP tool to Forgekeeper format', () => {
      const mcpTool = {
        name: 'search_code',
        description: 'Search for code in repository',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            path: { type: 'string' }
          },
          required: ['query']
        }
      };

      const result = mcpToolToForgekeeper(mcpTool, 'github');

      expect(result.type).toBe('function');
      expect(result.function.name).toBe('mcp_github_search_code');
      expect(result.function.description).toBe('Search for code in repository');
      expect(result.function.parameters.type).toBe('object');
      expect(result.function.parameters.properties.query).toBeDefined();
      expect(result.function.strict).toBe(true);
      expect(result._mcp.serverName).toBe('github');
      expect(result._mcp.originalName).toBe('search_code');
      expect(result._mcp.isMCP).toBe(true);
    });

    it('handles tool without input schema', () => {
      const mcpTool = {
        name: 'list_repos',
        description: 'List repositories'
      };

      const result = mcpToolToForgekeeper(mcpTool, 'github');

      expect(result.function.parameters.type).toBe('object');
      expect(result.function.parameters.properties).toEqual({});
      expect(result.function.parameters.required).toEqual([]);
    });

    it('throws error for invalid tool (missing name)', () => {
      const mcpTool = {
        description: 'No name tool'
      };

      expect(() => mcpToolToForgekeeper(mcpTool, 'github')).toThrow('Invalid MCP tool');
    });

    it('prefixes tool name with server name', () => {
      const mcpTool = {
        name: 'query',
        description: 'Query database'
      };

      const result = mcpToolToForgekeeper(mcpTool, 'postgres');

      expect(result.function.name).toBe('mcp_postgres_query');
    });
  });

  describe('convertMCPTools', () => {
    it('converts array of MCP tools', () => {
      const mcpTools = [
        { name: 'tool1', description: 'First tool' },
        { name: 'tool2', description: 'Second tool' }
      ];

      const results = convertMCPTools(mcpTools, 'test');

      expect(results).toHaveLength(2);
      expect(results[0].function.name).toBe('mcp_test_tool1');
      expect(results[1].function.name).toBe('mcp_test_tool2');
    });

    it('filters out invalid tools', () => {
      const mcpTools = [
        { name: 'valid', description: 'Valid tool' },
        { description: 'Invalid - no name' },
        { name: 'valid2', description: 'Valid tool 2' }
      ];

      const results = convertMCPTools(mcpTools, 'test');

      expect(results).toHaveLength(2);
      expect(results[0].function.name).toBe('mcp_test_valid');
      expect(results[1].function.name).toBe('mcp_test_valid2');
    });

    it('returns empty array for non-array input', () => {
      expect(convertMCPTools(null, 'test')).toEqual([]);
      expect(convertMCPTools(undefined, 'test')).toEqual([]);
      expect(convertMCPTools('not an array', 'test')).toEqual([]);
    });
  });

  describe('isMCPTool', () => {
    it('identifies MCP tools', () => {
      const mcpTool = {
        function: { name: 'mcp_github_create_issue' },
        _mcp: { isMCP: true, serverName: 'github' }
      };

      expect(isMCPTool(mcpTool)).toBe(true);
    });

    it('identifies non-MCP tools', () => {
      const nativeTool = {
        function: { name: 'read_file' }
      };

      expect(isMCPTool(nativeTool)).toBe(false);
    });

    it('handles null/undefined', () => {
      expect(isMCPTool(null)).toBe(false);
      expect(isMCPTool(undefined)).toBe(false);
    });
  });

  describe('getMCPMetadata', () => {
    it('extracts metadata from MCP tool', () => {
      const mcpTool = {
        function: { name: 'mcp_github_create_issue' },
        _mcp: {
          isMCP: true,
          serverName: 'github',
          originalName: 'create_issue'
        }
      };

      const metadata = getMCPMetadata(mcpTool);

      expect(metadata).toEqual({
        isMCP: true,
        serverName: 'github',
        originalName: 'create_issue'
      });
    });

    it('returns null for non-MCP tool', () => {
      const nativeTool = {
        function: { name: 'read_file' }
      };

      expect(getMCPMetadata(nativeTool)).toBe(null);
    });
  });

  describe('Schema Conversion', () => {
    it('converts object schema correctly', () => {
      const mcpTool = {
        name: 'create_pr',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR body' },
            draft: { type: 'boolean', description: 'Create as draft' }
          },
          required: ['title', 'body']
        }
      };

      const result = mcpToolToForgekeeper(mcpTool, 'github');
      const params = result.function.parameters;

      expect(params.type).toBe('object');
      expect(params.properties.title).toEqual({ type: 'string', description: 'PR title' });
      expect(params.properties.body).toEqual({ type: 'string', description: 'PR body' });
      expect(params.properties.draft).toEqual({ type: 'boolean', description: 'Create as draft' });
      expect(params.required).toEqual(['title', 'body']);
      expect(params.additionalProperties).toBe(false);
    });

    it('handles complex nested schemas', () => {
      const mcpTool = {
        name: 'complex_tool',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                timeout: { type: 'number' }
              }
            },
            tags: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['config']
        }
      };

      const result = mcpToolToForgekeeper(mcpTool, 'test');
      const params = result.function.parameters;

      expect(params.properties.config.type).toBe('object');
      expect(params.properties.config.properties.enabled).toBeDefined();
      expect(params.properties.tags.type).toBe('array');
    });
  });

  describe('Tool Naming', () => {
    it('prevents collisions with native tools', () => {
      const mcpTool = {
        name: 'read_file', // Same as native tool
        description: 'Read a file via MCP'
      };

      const result = mcpToolToForgekeeper(mcpTool, 'filesystem');

      // Should be prefixed, not colliding with native read_file
      expect(result.function.name).toBe('mcp_filesystem_read_file');
      expect(result.function.name).not.toBe('read_file');
    });

    it('handles server names with special characters', () => {
      const mcpTool = {
        name: 'query',
        description: 'Query database'
      };

      const result = mcpToolToForgekeeper(mcpTool, 'my-custom-server');

      expect(result.function.name).toBe('mcp_my-custom-server_query');
    });
  });

  describe('Error Handling', () => {
    it('provides helpful error for null tool', () => {
      expect(() => mcpToolToForgekeeper(null, 'github')).toThrow('Invalid MCP tool');
    });

    it('provides helpful error for missing name', () => {
      const mcpTool = { description: 'Tool without name' };
      expect(() => mcpToolToForgekeeper(mcpTool, 'github')).toThrow('missing name');
    });
  });
});
