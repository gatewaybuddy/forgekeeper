import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy to vLLM OpenAI server
const VLLM_TARGET = process.env.VLLM_PROXY_TARGET || 'http://localhost:8001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true, // Enable WebSocket/SSE proxying
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Ensure SSE headers are preserved
            if (req.url?.includes('/stream')) {
              proxyReq.setHeader('Accept', 'text/event-stream');
              proxyReq.setHeader('Cache-Control', 'no-cache');
              proxyReq.setHeader('Connection', 'keep-alive');
            }
          });
        }
      },
      '/v1': {
        target: VLLM_TARGET,
        changeOrigin: true,
        ws: false
      },
      '/health': {
        target: VLLM_TARGET,
        changeOrigin: true
      },
      '/healthz': {
        target: VLLM_TARGET,
        changeOrigin: true
      }
    }
  }
});

