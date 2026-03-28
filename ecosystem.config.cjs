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

  // Deployment configuration
  // Usage: pm2 deploy ecosystem.config.cjs production setup
  //        pm2 deploy ecosystem.config.cjs production
  deploy: {
    production: {
      user: process.env.DEPLOY_USER || 'deploy',
      host: process.env.DEPLOY_HOST || '0.0.0.0',
      ref: 'origin/main',
      repo: 'https://github.com/gatewaybuddy/forgekeeper.git',
      path: process.env.DEPLOY_PATH || '/opt/forgekeeper',
      'pre-deploy-local': 'echo "Deploying Forgekeeper to production..."',
      'post-deploy':
        'npm ci --production && pm2 startOrRestart ecosystem.config.cjs --env production',
      'pre-setup': 'echo "Setting up Forgekeeper on remote host..."',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
