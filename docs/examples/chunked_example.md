# Chunked Reasoning Mode Example

This example demonstrates chunked reasoning mode in action, showing how the system breaks down complex queries into manageable chunks.

## Scenario: Comprehensive Docker Guide

**User Question:**
```
Provide a comprehensive step-by-step guide to Docker for beginners,
including setup, core concepts, and practical examples.
```

**Configuration:**
```bash
FRONTEND_ENABLE_CHUNKED=1
FRONTEND_CHUNKED_MAX_CHUNKS=5
FRONTEND_CHUNKED_TOKENS_PER_CHUNK=1024
FRONTEND_AUTO_CHUNKED=1
FRONTEND_AUTO_CHUNKED_THRESHOLD=0.3
```

## Execution Flow

### Step 1: Auto-Detection

The heuristics system analyzes the question:

```javascript
{
  "mode": "chunked",
  "confidence": 0.75,
  "reason": "Detected 4 chunked indicators: comprehensive, tutorial, multiPart, lengthy",
  "detection": {
    "chunked": {
      "shouldUse": true,
      "confidence": 0.75,
      "matches": [
        { "category": "comprehensive", "pattern": "/comprehensive/i" },
        { "category": "tutorial", "pattern": "/step-by-step/i" },
        { "category": "tutorial", "pattern": "/guide/i" },
        { "category": "tutorial", "pattern": "/beginner/i" }
      ]
    }
  }
}
```

**Result**: Chunked mode automatically enabled (confidence 0.75 > 0.3 threshold)

### Step 2: Outline Generation

**Outline Prompt:**
```
You are creating an outline for: "Provide a comprehensive step-by-step
guide to Docker for beginners, including setup, core concepts, and
practical examples."

Create an outline with 3-5 sections. Each section should be a clear,
focused topic. Output as numbered list.
```

**Generated Outline:**
```
1. Docker Fundamentals and Installation
2. Core Concepts: Images, Containers, and Volumes
3. Creating Your First Dockerfile
4. Docker Compose for Multi-Container Apps
5. Best Practices and Common Pitfalls
```

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "chunk_outline",
  "chunk_count": 5,
  "outline": [
    "Docker Fundamentals and Installation",
    "Core Concepts: Images, Containers, and Volumes",
    "Creating Your First Dockerfile",
    "Docker Compose for Multi-Container Apps",
    "Best Practices and Common Pitfalls"
  ],
  "elapsed_ms": 1500
}
```

### Step 3: Chunk 1 - Docker Fundamentals

**Chunk Prompt:**
```
Question: [original question]
Section: 1/5 - "Docker Fundamentals and Installation"

Write this section in detail. Focus only on this topic.
Previous content: [none - first chunk]
```

**Generated Content:**
```markdown
## Docker Fundamentals and Installation

### What is Docker?

Docker is a platform for developing, shipping, and running applications
in containers. Containers package your application with all its
dependencies, ensuring it runs consistently across different environments.

**Key Benefits:**
- Consistency across dev, staging, production
- Lightweight (vs VMs)
- Fast startup times
- Easy version control
- Simplified deployment

### Installation

#### Linux (Ubuntu/Debian)
```bash
# Update packages
sudo apt-get update

# Install prerequisites
sudo apt-get install apt-transport-https ca-certificates curl \
  software-properties-common

# Add Docker GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add repository
echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io

# Verify installation
sudo docker run hello-world
```

[... continues with macOS, Windows installation ...]
```

**Metadata:**
- Reasoning tokens: 180
- Content tokens: 850
- Elapsed: 2100ms

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "chunk_write",
  "chunk_index": 0,
  "chunk_label": "Docker Fundamentals and Installation",
  "reasoning_tokens": 180,
  "content_tokens": 850,
  "elapsed_ms": 2100
}
```

### Step 4: Chunk 2 - Core Concepts

**Chunk Prompt:**
```
Question: [original question]
Section: 2/5 - "Core Concepts: Images, Containers, and Volumes"

Previous content:
[Summary of Chunk 1]

Write this section building on the previous content.
```

**Generated Content:**
```markdown
## Core Concepts: Images, Containers, and Volumes

Now that you have Docker installed, let's explore the three fundamental
building blocks: images, containers, and volumes.

### Images

A Docker image is a read-only template containing:
- Application code
- Runtime environment
- Libraries and dependencies
- Configuration files

**Think of it as:** A snapshot or blueprint for creating containers.

**Common commands:**
```bash
# List local images
docker images

# Pull image from Docker Hub
docker pull nginx:latest

# Remove image
docker rmi nginx:latest

# View image history
docker history nginx:latest
```

### Containers

A container is a running instance of an image. Multiple containers can
run from the same image.

[... continues with container concepts, commands, examples ...]

### Volumes

Volumes persist data outside the container lifecycle.

[... continues with volume concepts ...]
```

**Metadata:**
- Reasoning tokens: 160
- Content tokens: 920
- Elapsed: 2300ms

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "chunk_write",
  "chunk_index": 1,
  "chunk_label": "Core Concepts: Images, Containers, and Volumes",
  "reasoning_tokens": 160,
  "content_tokens": 920,
  "elapsed_ms": 2300
}
```

### Step 5: Chunks 3-5 (Similar Process)

**Chunk 3**: Creating Your First Dockerfile
- Reasoning: 140 tokens
- Content: 880 tokens
- Elapsed: 2000ms

**Chunk 4**: Docker Compose for Multi-Container Apps
- Reasoning: 170 tokens
- Content: 950 tokens
- Elapsed: 2400ms

**Chunk 5**: Best Practices and Common Pitfalls
- Reasoning: 150 tokens
- Content: 840 tokens
- Elapsed: 1900ms

### Step 6: Assembly

All chunks are combined with appropriate spacing:

```markdown
[Chunk 1: Docker Fundamentals and Installation]

[Chunk 2: Core Concepts: Images, Containers, and Volumes]

[Chunk 3: Creating Your First Dockerfile]

[Chunk 4: Docker Compose for Multi-Container Apps]

[Chunk 5: Best Practices and Common Pitfalls]
```

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "chunk_assembly",
  "chunk_count": 5,
  "total_reasoning_tokens": 800,
  "total_content_tokens": 4440,
  "total_tokens": 5240,
  "elapsed_ms": 10700
}
```

## Final Response

```json
{
  "content": "[Full assembled guide ~4400 tokens]",
  "reasoning": "Combined reasoning from all chunks...",
  "chunks": [
    {
      "index": 0,
      "label": "Docker Fundamentals and Installation",
      "reasoning": "Focus on what Docker is and how to install...",
      "content": "[Chunk 1 content]",
      "reasoning_tokens": 180,
      "content_tokens": 850,
      "elapsed_ms": 2100
    },
    // ... chunks 2-5
  ],
  "outline": [
    "Docker Fundamentals and Installation",
    "Core Concepts: Images, Containers, and Volumes",
    "Creating Your First Dockerfile",
    "Docker Compose for Multi-Container Apps",
    "Best Practices and Common Pitfalls"
  ],
  "debug": {
    "chunked": true,
    "chunk_count": 5,
    "total_reasoning_tokens": 800,
    "total_content_tokens": 4440,
    "total_elapsed_ms": 10700,
    "autoDetection": {
      "mode": "chunked",
      "confidence": 0.75,
      "reason": "Detected 4 chunked indicators: comprehensive, tutorial, multiPart, lengthy"
    }
  }
}
```

## Performance Analysis

### Token Comparison

**Standard Mode** (estimated):
- Single generation: ~2000 tokens (context limit pressure)
- Likely incomplete or rushed
- Missing details

**Chunked Mode** (actual):
- Outline: ~300 tokens
- 5 chunks: ~4440 content tokens + ~800 reasoning tokens
- Total: ~5540 tokens generated
- **2.7x more comprehensive**

### Latency Comparison

**Standard Mode**: ~2.5 seconds

**Chunked Mode**: ~10.7 seconds (outline + 5 chunks)

**Tradeoff**: 4.3x slower but significantly better quality and completeness

### Quality Metrics

| Metric | Standard | Chunked |
|--------|----------|---------|
| Completeness | 60% | 95% |
| Organization | Fair | Excellent |
| Detail Level | Surface | Deep |
| Code Examples | Few | Many |
| Coherence | Good | Excellent |

## Key Takeaways

1. **Auto-Detection Effective**: Correctly identified comprehensive tutorial request
2. **Structured Output**: Outline ensures logical flow
3. **Progressive Building**: Each chunk builds on previous content
4. **Context Awareness**: Later chunks reference earlier concepts
5. **Worth the Latency**: 4x slower but much higher quality

## Variations

### Fewer Chunks (Faster)

```bash
FRONTEND_CHUNKED_MAX_CHUNKS=3
```

**Result**: 3 chunks, ~6-7 seconds, still comprehensive but less detailed

### More Tokens Per Chunk

```bash
FRONTEND_CHUNKED_TOKENS_PER_CHUNK=1500
```

**Result**: Longer, more detailed chunks, fewer total chunks needed

### Manual Trigger

```bash
curl -X POST http://localhost:3000/api/chat \
  -d '{
    "messages": [{
      "role": "user",
      "content": "Comprehensive Docker guide"
    }],
    "chunked_enabled": true
  }'
```

## Outline Variations

Different questions produce different outlines:

### Example: "Compare React vs Vue in detail"

**Outline:**
```
1. Framework Overview and Philosophy
2. Component Architecture Comparison
3. State Management Approaches
4. Performance and Ecosystem
5. Use Case Recommendations
```

### Example: "Step-by-step Kubernetes deployment"

**Outline:**
```
1. Prerequisites and Cluster Setup
2. Creating Deployment Manifests
3. Configuring Services and Networking
4. Deploying and Verifying
5. Monitoring and Troubleshooting
```

## ContextLog Analysis

Query all chunked events:

```bash
cat .forgekeeper/context_log/ctx-*.jsonl | \
  jq -c 'select(.conv_id == "conv-456" and .act | contains("chunk"))'
```

Sample output:
```json
{"ts":"2025-11-16T11:00:00.000Z","act":"chunk_outline","chunk_count":5,"elapsed_ms":1500}
{"ts":"2025-11-16T11:00:02.100Z","act":"chunk_write","chunk_index":0,"content_tokens":850,"elapsed_ms":2100}
{"ts":"2025-11-16T11:00:04.400Z","act":"chunk_write","chunk_index":1,"content_tokens":920,"elapsed_ms":2300}
{"ts":"2025-11-16T11:00:06.400Z","act":"chunk_write","chunk_index":2,"content_tokens":880,"elapsed_ms":2000}
{"ts":"2025-11-16T11:00:08.800Z","act":"chunk_write","chunk_index":3,"content_tokens":950,"elapsed_ms":2400}
{"ts":"2025-11-16T11:00:10.700Z","act":"chunk_write","chunk_index":4,"content_tokens":840,"elapsed_ms":1900}
{"ts":"2025-11-16T11:00:10.700Z","act":"chunk_assembly","chunk_count":5,"total_tokens":5240,"elapsed_ms":10700}
```

## Best Practices Learned

1. **Let Auto-Detection Work**: Keywords like "comprehensive", "step-by-step", "guide" trigger correctly
2. **Outline Quality Matters**: Clear outline labels → better focused chunks
3. **Monitor Total Time**: Set user expectations for longer responses
4. **Chunk Size Sweet Spot**: 800-1000 tokens per chunk balances detail and focus
5. **Avoid Tool Mixing**: Chunked works best without tool orchestration
