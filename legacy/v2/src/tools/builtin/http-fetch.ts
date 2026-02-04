/**
 * HTTP fetch tool
 */
import { Tool, ToolResult } from '../types.js';
import { validateArgs } from '../sandbox.js';

export const httpFetchTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'http_fetch',
      description:
        'Make HTTP requests to external APIs. Supports GET, POST, PUT, DELETE methods.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to fetch',
          },
          method: {
            type: 'string',
            description: 'HTTP method (default: GET)',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          },
          headers: {
            type: 'object',
            description: 'HTTP headers as key-value pairs',
            additionalProperties: { type: 'string' },
          },
          body: {
            type: 'string',
            description: 'Request body (for POST, PUT, PATCH)',
          },
          timeout: {
            type: 'integer',
            description: 'Request timeout in milliseconds (default: 10000)',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
      strict: true,
    },
  },

  async run(args): Promise<ToolResult> {
    try {
      validateArgs(args, ['url']);

      const { url, method = 'GET', headers = {}, body, timeout = 10000 } = args;

      // Validate URL
      try {
        new URL(url);
      } catch {
        return {
          success: false,
          error: `Invalid URL: ${url}`,
        };
      }

      const startTime = Date.now();

      // Create fetch options
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'User-Agent': 'Forgekeeper/2.0',
          ...headers,
        },
        signal: AbortSignal.timeout(timeout),
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = body;
        if (!headers['Content-Type']) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Content-Type': 'application/json',
          };
        }
      }

      // Make request
      const response = await fetch(url, fetchOptions);

      const executionTime = Date.now() - startTime;

      // Get response body
      const contentType = response.headers.get('content-type') || '';
      let responseBody: any;

      if (contentType.includes('application/json')) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = await response.text();
        }
      } else {
        responseBody = await response.text();
      }

      // Extract headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        success: response.ok,
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          url: response.url,
          executionTime,
        },
        executionTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
