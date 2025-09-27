/* eslint-env node */

import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeBaseUrl = (url) => {
  if (!url) {
    return ''
  }
  const trimmed = url.trim()
  if (trimmed.endsWith('/graphql')) {
    return trimmed.replace(/\/graphql\/?$/, '')
  }
  return trimmed.replace(/\/$/, '')
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.BACKEND_PORT || process.env.BACKEND_PORT || '4000'
  const backendUrl = env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || `http://localhost:${backendPort}`
  const target = normalizeBaseUrl(backendUrl) || `http://localhost:${backendPort}`

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/graphql': {
          target,
          changeOrigin: true,
          ws: false,
        },
      },
    },
  }
})
