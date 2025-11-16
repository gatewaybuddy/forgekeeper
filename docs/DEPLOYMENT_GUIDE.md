# Deployment Guide - Forgekeeper v1.1.0

Complete guide for deploying Forgekeeper with M1 (Tool Hardening) and M2 (Chunked Reasoning) features.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Deployment Methods](#deployment-methods)
- [Feature Enablement](#feature-enablement)
- [Security Hardening](#security-hardening)
- [Monitoring & Observability](#monitoring--observability)
- [Troubleshooting](#troubleshooting)
- [Production Checklist](#production-checklist)

---

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 4 cores
- RAM: 8GB
- Disk: 20GB free space
- OS: Linux (Ubuntu 20.04+), macOS (12+), Windows (WSL2)

**Recommended:**
- CPU: 8+ cores
- RAM: 16GB+
- Disk: 50GB+ SSD
- OS: Linux (Ubuntu 22.04+)
- GPU: NVIDIA GPU with 8GB+ VRAM (for llama.cpp CUDA support)

### Software Dependencies

- **Python**: 3.11+ (3.12 recommended)
- **Node.js**: 20+ (LTS recommended)
- **Docker**: 24.0+ (for containerized deployment)
- **Docker Compose**: 2.20+ (for multi-container setup)
- **Git**: 2.30+ (for source control)
- **gh CLI**: 2.20+ (optional, for GitHub integration)

### Network Requirements

- **Ports**:
  - 3000: Frontend server (production)
  - 5173: Frontend dev server (development)
  - 8001: LLM core inference (llama.cpp/vLLM)
- **Firewall**: Allow inbound on frontend port (3000 or 5173)
- **Internet**: Required for initial setup (npm/pip packages)

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/gatewaybuddy/forgekeeper.git
cd forgekeeper
git checkout v1.1.0  # Use specific version tag
```

### 2. Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit configuration
nano .env  # or your preferred editor
```

### 3. Start Stack

**Option A: Docker (Recommended)**
```bash
# Ensure LLM core is available
bash scripts/ensure_llama_core.sh

# Start all services
python -m forgekeeper ensure-stack --build

# Or use the convenience script
bash start.sh  # Linux/macOS
# OR
pwsh start.ps1  # Windows
```

**Option B: Manual**
```bash
# Install Python dependencies
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# OR
.venv\Scripts\activate  # Windows
pip install -e .[dev]

# Install frontend dependencies
cd frontend
npm install

# Build frontend
npm run build

# Start services (separate terminals)
# Terminal 1: Start LLM core (if local)
# Terminal 2: Start frontend server
cd frontend && npm run dev
```

### 4. Verify Installation

```bash
# Check health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"..."}

# Check configuration
curl http://localhost:3000/config.json

# Verify features enabled
```

### 5. Access UI

Open browser: `http://localhost:5173` (dev) or `http://localhost:3000` (prod)

---

## Environment Configuration

### Core Configuration

```bash
# === Core Inference ===
FK_CORE_KIND=llama                    # Options: llama, vllm
FK_CORE_API_BASE=http://localhost:8001/v1
LLAMA_MODEL_CORE=models/your-model.gguf
```

### Frontend Configuration

```bash
# === Frontend Server ===
FRONTEND_PORT=3000
FRONTEND_VLLM_MODEL=core
FRONTEND_MAX_TOKENS=8192
FRONTEND_TEMP=0.0
FRONTEND_TOP_P=0.4
FRONTEND_CONT_ATTEMPTS=2
FRONTEND_USE_HARMONY=1
```

### M1: Tool Hardening

```bash
# === Tool Execution (T11) ===
TOOLS_EXECUTION_ENABLED=1              # Global tool execution toggle
TOOL_TIMEOUT_MS=30000                  # 30 second timeout
TOOL_MAX_RETRIES=0                     # No retries by default
TOOL_MAX_OUTPUT_BYTES=1048576          # 1MB max output
TOOL_ALLOW=echo,get_time,read_file    # Allowlist (comma-separated)

# === Tool Persistence (T12) ===
FGK_CONTEXTLOG_DIR=.forgekeeper/context_log
FGK_CONTEXTLOG_MAX_BYTES=10485760      # 10MB per file

# === Sensitive Data Redaction (T21) ===
# No specific env vars - always enabled when tools are enabled

# === Rate Limiting (T22) ===
RATE_LIMIT_ENABLED=1                   # Enable rate limiting
RATE_LIMIT_CAPACITY=100                # Max burst size
RATE_LIMIT_REFILL_RATE=10              # Tokens per second
RATE_LIMIT_COST_PER_REQUEST=1          # Cost per request

# === System Prompts (T28) ===
TOOL_PROMPT_INCLUDE_GUARDRAILS=1       # Include guardrails in prompts
TOOL_PROMPT_VARIANT=enabled            # Options: enabled, disabled
```

### M2: Chunked Reasoning

```bash
# === Review Mode ===
FRONTEND_ENABLE_REVIEW=1               # Enable review mode
FRONTEND_REVIEW_MODE=auto              # Options: manual, always, auto
FRONTEND_REVIEW_ITERATIONS=2           # Max review cycles
FRONTEND_REVIEW_THRESHOLD=0.7          # Quality threshold (0.0-1.0)
FRONTEND_REVIEW_MAX_REGENERATIONS=1    # Max regen attempts
FRONTEND_REVIEW_EVAL_TOKENS=512        # Tokens for evaluation

# === Chunked Mode ===
FRONTEND_ENABLE_CHUNKED=1              # Enable chunked mode
FRONTEND_CHUNKED_MAX_CHUNKS=5          # Max chunks per response
FRONTEND_CHUNKED_TOKENS_PER_CHUNK=1024 # Tokens per chunk
FRONTEND_CHUNKED_AUTO_THRESHOLD=2048   # Auto-trigger threshold
FRONTEND_CHUNKED_AUTO_OUTLINE=1        # Let model determine count
FRONTEND_CHUNKED_OUTLINE_RETRIES=2     # Outline retry attempts
FRONTEND_CHUNKED_OUTLINE_TOKENS=512    # Max tokens for outline

# === Combined Mode (T209) ===
FRONTEND_COMBINED_REVIEW_STRATEGY=final_only  # Options: per_chunk, final_only, both

# === Auto-Detection (T210) ===
FRONTEND_AUTO_REVIEW=1                 # Enable review auto-detection
FRONTEND_AUTO_CHUNKED=1                # Enable chunked auto-detection
FRONTEND_AUTO_REVIEW_THRESHOLD=0.5     # Review confidence threshold
FRONTEND_AUTO_CHUNKED_THRESHOLD=0.3    # Chunked confidence threshold
```

---

## Deployment Methods

### Method 1: Docker Compose (Recommended)

**Advantages:**
- Isolated environment
- Easy scaling
- Consistent across systems
- GPU support (CUDA)

**Setup:**

```yaml
# docker-compose.yml (simplified)
services:
  llama-core:
    image: ghcr.io/ggerganov/llama.cpp:server-cuda
    volumes:
      - ./models:/models
    environment:
      - MODEL=/models/your-model.gguf
    ports:
      - "8001:8001"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - FK_CORE_API_BASE=http://llama-core:8001/v1
      - TOOLS_EXECUTION_ENABLED=1
      - FRONTEND_ENABLE_REVIEW=1
      - FRONTEND_ENABLE_CHUNKED=1
    volumes:
      - ./.forgekeeper:/app/.forgekeeper
    depends_on:
      - llama-core
```

**Deploy:**

```bash
# Build and start
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Method 2: Systemd Service (Linux)

**Advantages:**
- Native OS integration
- Auto-restart on failure
- Resource limits
- Log rotation

**Setup:**

```bash
# Create service file
sudo nano /etc/systemd/system/forgekeeper.service
```

```ini
[Unit]
Description=Forgekeeper Frontend Server
After=network.target

[Service]
Type=simple
User=forgekeeper
WorkingDirectory=/opt/forgekeeper
Environment="NODE_ENV=production"
EnvironmentFile=/opt/forgekeeper/.env
ExecStart=/usr/bin/node /opt/forgekeeper/frontend/server.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/forgekeeper/.forgekeeper

# Resource limits
LimitNOFILE=65536
MemoryLimit=2G
CPUQuota=200%

[Install]
WantedBy=multi-user.target
```

**Deploy:**

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable forgekeeper

# Start service
sudo systemctl start forgekeeper

# Check status
sudo systemctl status forgekeeper

# View logs
sudo journalctl -u forgekeeper -f
```

### Method 3: PM2 (Process Manager)

**Advantages:**
- Simple deployment
- Auto-restart
- Load balancing
- Log management

**Setup:**

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem file
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'forgekeeper',
    script: './frontend/server.mjs',
    cwd: '/path/to/forgekeeper',
    instances: 2,  // Cluster mode
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      FRONTEND_PORT: 3000,
    },
    env_file: '.env',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '2G',
  }]
};
```

**Deploy:**

```bash
# Start application
pm2 start ecosystem.config.js

# Save configuration
pm2 save

# Setup startup script
pm2 startup

# Manage
pm2 status
pm2 logs forgekeeper
pm2 restart forgekeeper
pm2 stop forgekeeper
```

---

## Feature Enablement

### Enabling M1 Features (Tool Hardening)

**Minimal (Tools Only):**
```bash
export TOOLS_EXECUTION_ENABLED=1
```

**Recommended (All M1):**
```bash
export TOOLS_EXECUTION_ENABLED=1
export TOOL_TIMEOUT_MS=30000
export RATE_LIMIT_ENABLED=1
export RATE_LIMIT_CAPACITY=100
export TOOL_PROMPT_INCLUDE_GUARDRAILS=1
```

**Testing:**
```bash
# Send test message
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What time is it?"}],
    "model": "core",
    "max_tokens": 100
  }'

# Check ContextLog
tail -f .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act | contains("tool"))'
```

### Enabling M2 Features (Chunked Reasoning)

**Review Mode Only:**
```bash
export FRONTEND_ENABLE_REVIEW=1
export FRONTEND_REVIEW_THRESHOLD=0.7
export FRONTEND_AUTO_REVIEW=1  # Optional: auto-detection
```

**Chunked Mode Only:**
```bash
export FRONTEND_ENABLE_CHUNKED=1
export FRONTEND_CHUNKED_MAX_CHUNKS=5
export FRONTEND_AUTO_CHUNKED=1  # Optional: auto-detection
```

**Combined Mode (Review + Chunked):**
```bash
export FRONTEND_ENABLE_REVIEW=1
export FRONTEND_ENABLE_CHUNKED=1
export FRONTEND_COMBINED_REVIEW_STRATEGY=final_only
export FRONTEND_AUTO_REVIEW=1
export FRONTEND_AUTO_CHUNKED=1
```

**Testing:**
```bash
# Test review mode (should auto-trigger on technical questions)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Verify this production deployment: ..."}],
    "model": "core"
  }'

# Test chunked mode (should auto-trigger on comprehensive requests)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Write a comprehensive guide to Docker with step-by-step examples"}],
    "model": "core"
  }'

# Check events
tail -100 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act | contains("review") or contains("chunk"))'
```

---

## Security Hardening

### 1. Tool Allowlist

**Default (Permissive):**
```bash
# Uses DEFAULT_TOOL_ALLOWLIST from tools.config.mjs (19 tools)
TOOLS_EXECUTION_ENABLED=1
```

**Restricted (Production):**
```bash
# Only allow safe, read-only tools
TOOL_ALLOW=echo,get_time,read_file,read_dir,http_fetch
```

**Custom:**
```bash
# Specify exact tools needed
TOOL_ALLOW=read_file,git_status,git_diff,create_task_card
```

### 2. Rate Limiting

**Conservative (High Security):**
```bash
RATE_LIMIT_CAPACITY=20    # Small burst
RATE_LIMIT_REFILL_RATE=2  # 2 req/sec steady state
```

**Balanced (Recommended):**
```bash
RATE_LIMIT_CAPACITY=100   # Moderate burst
RATE_LIMIT_REFILL_RATE=10 # 10 req/sec
```

**Permissive (Development):**
```bash
RATE_LIMIT_CAPACITY=500   # Large burst
RATE_LIMIT_REFILL_RATE=50 # 50 req/sec
```

### 3. Network Security

**Firewall Rules (iptables):**
```bash
# Allow frontend port
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Allow LLM core (local only)
sudo iptables -A INPUT -p tcp --dport 8001 -s 127.0.0.1 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8001 -j DROP

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

**Nginx Reverse Proxy:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000";

    # Rate limiting (Nginx level)
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. File Permissions

```bash
# Restrict ContextLog directory
chmod 700 .forgekeeper/context_log
chmod 600 .forgekeeper/context_log/*.jsonl

# Restrict configuration
chmod 600 .env

# Restrict sandbox
chmod 700 .forgekeeper/sandbox
```

---

## Monitoring & Observability

### 1. ContextLog Analysis

**View Recent Events:**
```bash
# Last 50 events
tail -50 .forgekeeper/context_log/ctx-*.jsonl | jq .

# Tool executions only
tail -100 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act | contains("tool"))'

# Review events only
tail -100 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act | contains("review"))'

# Chunk events only
tail -100 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act | contains("chunk"))'
```

**Count Events:**
```bash
# Tool execution count (last hour)
tail -1000 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act == "tool_execution_finish")' | wc -l

# Review cycle count
tail -1000 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act == "review_cycle")' | wc -l

# Average review score
tail -1000 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act == "review_cycle") | .quality_score' | awk '{sum+=$1; count++} END {print sum/count}'
```

### 2. Rate Limit Monitoring

**Check Metrics:**
```bash
# Get current rate limit status
curl http://localhost:3000/api/rate-limit/metrics | jq .

# Expected output:
# {
#   "success": true,
#   "metrics": {
#     "enabled": true,
#     "hits": 42,
#     "totalRequests": 250,
#     "currentTokens": 75,
#     "capacity": 100,
#     "refillRate": 10
#   }
# }
```

**Watch Real-Time:**
```bash
watch -n 1 'curl -s http://localhost:3000/api/rate-limit/metrics | jq .metrics'
```

### 3. Tool Execution Monitoring

**Via API:**
```bash
# Get last 50 tool executions
curl 'http://localhost:3000/api/tools/executions?n=50' | jq .

# Filter by conversation
curl 'http://localhost:3000/api/tools/executions?conv_id=YOUR_CONV_ID' | jq .
```

**Via DiagnosticsDrawer UI:**
- Open chat interface
- Click "Diagnostics" button
- View:
  - Tool Executions (success/failure status)
  - Review History (quality scores, critiques)
  - Chunk Breakdown (token counts, labels)

### 4. Health Checks

**Endpoint:**
```bash
curl http://localhost:3000/health
```

**Monitoring Script:**
```bash
#!/bin/bash
# health-check.sh

URL="http://localhost:3000/health"
TIMEOUT=5
MAX_FAILURES=3
failures=0

while true; do
  if curl -sf --max-time $TIMEOUT $URL > /dev/null; then
    echo "[$(date)] Health check: OK"
    failures=0
  else
    ((failures++))
    echo "[$(date)] Health check: FAILED ($failures/$MAX_FAILURES)"

    if [ $failures -ge $MAX_FAILURES ]; then
      echo "[$(date)] Max failures reached. Restarting service..."
      systemctl restart forgekeeper  # or pm2 restart forgekeeper
      failures=0
    fi
  fi

  sleep 30
done
```

---

## Troubleshooting

### Issue: Tools Not Executing

**Symptoms:**
- Tool calls return "Tool execution is disabled globally"
- No tool events in ContextLog

**Solutions:**
1. Check `TOOLS_EXECUTION_ENABLED`:
   ```bash
   echo $TOOLS_EXECUTION_ENABLED
   # Should be: 1
   ```

2. Verify tool is in allowlist:
   ```bash
   echo $TOOL_ALLOW
   # Should include the tool name
   ```

3. Check logs:
   ```bash
   journalctl -u forgekeeper -n 100 | grep TOOL
   # OR
   pm2 logs forgekeeper | grep TOOL
   ```

### Issue: Rate Limiting Too Aggressive

**Symptoms:**
- Many 429 responses
- "Rate limit exceeded" errors

**Solutions:**
1. Check current metrics:
   ```bash
   curl http://localhost:3000/api/rate-limit/metrics
   ```

2. Increase capacity:
   ```bash
   export RATE_LIMIT_CAPACITY=500
   export RATE_LIMIT_REFILL_RATE=50
   systemctl restart forgekeeper
   ```

3. Or disable temporarily:
   ```bash
   export RATE_LIMIT_ENABLED=0
   systemctl restart forgekeeper
   ```

### Issue: Review/Chunked Not Triggering

**Symptoms:**
- No review or chunk events in ContextLog
- Standard responses even for complex questions

**Solutions:**
1. Verify features enabled:
   ```bash
   curl http://localhost:3000/config.json | jq '{reviewEnabled, chunkedEnabled}'
   ```

2. Check auto-detection thresholds:
   ```bash
   echo $FRONTEND_AUTO_REVIEW_THRESHOLD
   echo $FRONTEND_AUTO_CHUNKED_THRESHOLD
   # Lower values = more sensitive
   ```

3. Force enable (bypass auto-detection):
   ```bash
   export FRONTEND_REVIEW_MODE=always
   export FRONTEND_ENABLE_CHUNKED=1
   ```

### Issue: High Memory Usage

**Symptoms:**
- Service crashes with OOM
- Slow response times

**Solutions:**
1. Reduce token limits:
   ```bash
   export FRONTEND_MAX_TOKENS=4096  # Default: 8192
   export FRONTEND_CHUNKED_TOKENS_PER_CHUNK=512  # Default: 1024
   ```

2. Reduce chunk count:
   ```bash
   export FRONTEND_CHUNKED_MAX_CHUNKS=3  # Default: 5
   ```

3. Disable review mode:
   ```bash
   export FRONTEND_ENABLE_REVIEW=0
   ```

4. Add systemd memory limit:
   ```ini
   [Service]
   MemoryLimit=4G
   ```

### Issue: ContextLog Files Growing Large

**Symptoms:**
- Disk space filling up
- Large .jsonl files

**Solutions:**
1. Check current size:
   ```bash
   du -sh .forgekeeper/context_log/
   ```

2. Reduce max file size:
   ```bash
   export FGK_CONTEXTLOG_MAX_BYTES=5242880  # 5MB (default: 10MB)
   ```

3. Manual cleanup:
   ```bash
   # Delete files older than 7 days
   find .forgekeeper/context_log/ -name "ctx-*.jsonl" -mtime +7 -delete
   ```

4. Add cron job:
   ```bash
   # /etc/cron.daily/forgekeeper-cleanup
   #!/bin/bash
   find /opt/forgekeeper/.forgekeeper/context_log/ -name "ctx-*.jsonl" -mtime +7 -delete
   ```

---

## Production Checklist

### Pre-Deployment

- [ ] Review `.env` configuration
- [ ] Set appropriate rate limits
- [ ] Configure tool allowlist
- [ ] Enable HTTPS (if public)
- [ ] Set up firewall rules
- [ ] Configure log rotation
- [ ] Test health check endpoint
- [ ] Verify ContextLog directory permissions
- [ ] Set memory/CPU limits
- [ ] Configure backups (for .forgekeeper directory)

### Post-Deployment

- [ ] Verify all services started
- [ ] Check health endpoint responds
- [ ] Test tool execution
- [ ] Verify rate limiting works
- [ ] Check ContextLog is writing
- [ ] Test review mode (if enabled)
- [ ] Test chunked mode (if enabled)
- [ ] Monitor resource usage (CPU, RAM, disk)
- [ ] Set up monitoring alerts
- [ ] Document deployment for team

### Ongoing Maintenance

- [ ] Monitor ContextLog disk usage weekly
- [ ] Review rate limit metrics weekly
- [ ] Check for security updates monthly
- [ ] Backup ContextLog data monthly
- [ ] Review and rotate logs monthly
- [ ] Update documentation as needed
- [ ] Test disaster recovery quarterly

---

## Support

### Documentation
- [Tool Quickstart](tooling/QUICKSTART.md)
- [Tool Guardrails](tooling/GUARDRAILS.md)
- [Troubleshooting](tooling/TROUBLESHOOTING.md)
- [Self-Review Guide](features/self_review.md)
- [Chunked Reasoning](features/chunked_reasoning.md)

### Resources
- **GitHub**: https://github.com/gatewaybuddy/forgekeeper
- **Issues**: https://github.com/gatewaybuddy/forgekeeper/issues
- **Discussions**: https://github.com/gatewaybuddy/forgekeeper/discussions

---

**Last Updated**: 2025-11-16
**Version**: 1.1.0
**Deployment Guide**: Complete ✅
