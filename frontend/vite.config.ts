import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy to vLLM OpenAI server
const VLLM_TARGET = process.env.VLLM_PROXY_TARGET || 'http://localhost:8001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
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

