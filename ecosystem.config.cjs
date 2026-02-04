// PM2 Ecosystem Configuration for Forgekeeper v3
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'forgekeeper',
      script: 'index.js',
      cwd: __dirname,

      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,

      // Watch for file changes (disable in production)
      watch: false,
      ignore_watch: ['node_modules', 'data', 'logs', '.git'],

      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Environment
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // Resource limits (optional)
      // max_memory_restart: '500M',

      // Cluster mode (for future horizontal scaling)
      // instances: 1,
      // exec_mode: 'cluster',
    },
  ],
};
