/**
 * Thought World - Multi-Agent Consensus Integration
 *
 * 3-agent consensus protocol for high-stakes decisions:
 * Forge (Executor) → Loom (Verifier) → Anvil (Integrator) → Consensus
 *
 * Each agent can use a different LLM provider (OpenAI, Anthropic, local inference)
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';
import dotenv from 'dotenv';
import { runTool } from '../../tools/index.mjs';

dotenv.config();

// Agent configuration from environment
const AGENTS = {
  forge: {
    provider: process.env.FORGE_PROVIDER || 'anthropic',
    apiKey: process.env.FORGE_API_KEY || process.env.ANTHROPIC_API_KEY,
    model: process.env.FORGE_MODEL || 'claude-sonnet-4-5-20250929',
    apiBase: process.env.FORGE_API_BASE || 'https://api.anthropic.com'
  },
  scout: {
    provider: process.env.SCOUT_PROVIDER || 'anthropic',
    apiKey: process.env.SCOUT_API_KEY || process.env.ANTHROPIC_API_KEY,
    model: process.env.SCOUT_MODEL || 'claude-3-5-haiku-20241022',
    apiBase: process.env.SCOUT_API_BASE || 'https://api.anthropic.com'
  },
  loom: {
    provider: process.env.LOOM_PROVIDER || 'anthropic',
    apiKey: process.env.LOOM_API_KEY || process.env.ANTHROPIC_API_KEY,
    model: process.env.LOOM_MODEL || 'claude-3-haiku-20240307',
    apiBase: process.env.LOOM_API_BASE || 'https://api.anthropic.com'
  },
  anvil: {
    provider: process.env.ANVIL_PROVIDER || 'anthropic',
    apiKey: process.env.ANVIL_API_KEY || process.env.ANTHROPIC_API_KEY,
    model: process.env.ANVIL_MODEL || 'claude-sonnet-4-5-20250929',
    apiBase: process.env.ANVIL_API_BASE || 'https://api.anthropic.com'
  }
};

// Initialize provider clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.LOOM_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.FORGE_API_KEY,
  baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
});

// Load agent prompts
export async function loadPrompt(role, version = 'v1') {
  // In Docker: /app/.forgekeeper (mounted volume)
  // On host: ../forgekeeper (when running from frontend/)
  // Try Docker path first, fall back to host path
  const dockerPath = path.join('.forgekeeper', 'thought_world', 'prompts', version, `${role}.txt`);
  const hostPath = path.join('..', '.forgekeeper', 'thought_world', 'prompts', version, `${role}.txt`);

  try {
    return await fs.readFile(dockerPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return await fs.readFile(hostPath, 'utf8');
    }
    throw err;
  }
}

// Parse JSON from agent response (handles both pure JSON and text with embedded JSON)
export function extractJSON(text) {
  try {
    // Try parsing as pure JSON first
    return JSON.parse(text);
  } catch {
    // Look for JSON block in text
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Export AGENTS config for use in tool execution
export { AGENTS };

/**
 * Provider-agnostic LLM call (non-streaming)
 * Handles OpenAI, Anthropic, and potentially local inference
 */
export async function callLLM(agentConfig, systemPrompt, userMessage, maxTokens = 4096) {
  const { provider, apiKey, model, apiBase } = agentConfig;

  if (provider === 'openai') {
    // Use Responses API for OpenAI with direct fetch
    const combinedInput = `${systemPrompt}\n\n${userMessage}`;

    const response = await fetch(`${apiBase}/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_output_tokens: maxTokens,
        input: combinedInput
      })
    });

    if (!response.ok) {
      throw new Error(`Responses API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.output[0]?.content[0]?.text || '';
  } else if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: userMessage }]
    });

    return response.content[0].text;
  } else if (provider === 'local' || provider === 'vllm' || provider === 'llama') {
    // Local inference via OpenAI-compatible API
    const client = new OpenAI({
      apiKey: 'dev-key',
      baseURL: apiBase
    });

    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    });

    return response.choices[0].message.content;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Provider-agnostic LLM call with streaming
 * Calls onChunk(content) for each token/chunk received
 */
export async function callLLMStreaming(agentConfig, systemPrompt, userMessage, maxTokens, onChunk) {
  const { provider, apiKey, model, apiBase } = agentConfig;

  if (provider === 'openai' || provider === 'local' || provider === 'vllm' || provider === 'llama') {
    const client = new OpenAI({
      apiKey: provider === 'openai' ? apiKey : 'dev-key',
      baseURL: apiBase
    });

    // Use Responses API for OpenAI provider, Chat Completions for local/vllm/llama
    if (provider === 'openai') {
      // Combine system prompt and user message for Responses API
      const combinedInput = `${systemPrompt}\n\n${userMessage}`;

      // Use direct fetch for Responses API (SDK doesn't support it yet)
      const url = `${apiBase}/responses`;
      console.log(`[forge] Calling Responses API: ${url} with model: ${model}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_output_tokens: maxTokens,
          input: combinedInput,
          stream: false  // Non-streaming for now
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.log(`[forge] Responses API error: ${response.status} ${response.statusText}, body: ${errorBody}`);
        throw new Error(`Responses API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.output[0]?.content[0]?.text || '';

      // Simulate streaming by calling onChunk once with full text
      onChunk(text);
      return text;
    } else {
      // Use Chat Completions API for local/vllm/llama providers
      const stream = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      });

      let fullContent = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      }
      return fullContent;
    }

  } else if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });

    const stream = await client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: userMessage }]
    });

    let fullContent = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const delta = chunk.delta.text;
        fullContent += delta;
        onChunk(delta);
      }
    }
    return fullContent;

  } else {
    throw new Error(`Unsupported provider for streaming: ${provider}`);
  }
}

// Call Forge (Executor)
export async function callExecutor(task, context = {}) {
  const systemPrompt = await loadPrompt('executor');

  const userMessage = context.humanInput
    ? `Task: ${task}\n\nHuman context: ${context.humanInput}`
    : `Task: ${task}`;

  const content = await callLLM(AGENTS.forge, systemPrompt, userMessage, 4096);

  return {
    id: ulid(),
    agent: 'forge',
    role: 'executor',
    content,
    timestamp: new Date().toISOString()
  };
}

// Call Loom (Verifier)
export async function callVerifier(executorResponse, context = {}) {
  const systemPrompt = await loadPrompt('verifier');

  let userMessage = `Review this proposal from Forge (Executor):\n\n${executorResponse.content}\n\n`;
  userMessage += 'Your task: Identify what Forge missed, got wrong, or could improve. ';
  userMessage += 'Do NOT just rephrase—find genuine gaps or errors.';

  if (context.humanInput) {
    userMessage += `\n\nHuman input: ${context.humanInput}`;
  }

  const content = await callLLM(AGENTS.loom, systemPrompt, userMessage, 2048);

  return {
    id: ulid(),
    agent: 'loom',
    role: 'verifier',
    content,
    executorId: executorResponse.id,
    timestamp: new Date().toISOString()
  };
}

// Call Anvil (Integrator)
export async function callIntegrator(executorResponse, verifierResponse, task, context = {}) {
  const systemPrompt = await loadPrompt('integrator');

  let userMessage = `Task: ${task}\n\n`;
  userMessage += `=== FORGE'S PROPOSAL ===\n${executorResponse.content}\n\n`;
  userMessage += `=== LOOM'S REVIEW ===\n${verifierResponse.content}\n\n`;
  userMessage += `Your task: Make the final consensus decision. Use the output format specified in your system prompt.`;

  if (context.humanInput) {
    userMessage += `\n\nHuman input: ${context.humanInput}`;
  }

  const content = await callLLM(AGENTS.anvil, systemPrompt, userMessage, 2048);

  return {
    id: ulid(),
    agent: 'anvil',
    role: 'integrator',
    content,
    executorId: executorResponse.id,
    verifierId: verifierResponse.id,
    timestamp: new Date().toISOString()
  };
}

// Parse consensus decision
function parseConsensusDecision(integratorResponse) {
  const content = integratorResponse.content.toLowerCase();

  let decision = 'unknown';
  if (content.includes('decision: approve') && !content.includes('with modifications')) {
    decision = 'approved';
  } else if (content.includes('approve with') || content.includes('decision: approve with')) {
    decision = 'approved_with_modifications';
  } else if (content.includes('decision: reject')) {
    decision = 'rejected';
  } else if (content.includes('decision: escalate') || content.includes('escalate to human')) {
    decision = 'escalated';
  }

  return {
    decision,
    rawContent: integratorResponse.content
  };
}

// Log episode to memory
async function logEpisode(data) {
  const episode = {
    id: ulid(),
    phase: '1',
    mode: 'thought-world',
    timestamp: new Date().toISOString(),
    ...data
  };

  const logPath = '.forgekeeper/thought_world/memory/episodes.jsonl';

  await fs.mkdir('.forgekeeper/thought_world/memory', { recursive: true });

  try {
    await fs.access(logPath);
  } catch {
    await fs.writeFile(logPath, '');
  }

  await fs.appendFile(logPath, JSON.stringify(episode) + '\n');

  return episode;
}

/**
 * Run 3-agent consensus on a task
 *
 * @param {string} task - The task description
 * @param {object} options - Optional context (humanInput, etc.)
 * @returns {object} - Consensus result with all agent responses
 */
export async function runThoughtWorld(task, options = {}) {
  const context = {
    humanInput: options.humanInput || null
  };

  // 1. Forge proposes
  const executorResponse = await callExecutor(task, context);

  // 2. Loom reviews
  const verifierResponse = await callVerifier(executorResponse, context);

  // 3. Anvil decides
  const integratorResponse = await callIntegrator(
    executorResponse,
    verifierResponse,
    task,
    context
  );

  // 4. Parse decision
  const consensus = parseConsensusDecision(integratorResponse);

  // 5. Log episode
  const episode = await logEpisode({
    task,
    executor: executorResponse,
    verifier: verifierResponse,
    integrator: integratorResponse,
    consensus,
    humanInput: context.humanInput
  });

  return {
    success: consensus.decision === 'approved' || consensus.decision === 'approved_with_modifications',
    decision: consensus.decision,
    agents: {
      forge: executorResponse,
      loom: verifierResponse,
      anvil: integratorResponse
    },
    consensus,
    episodeId: episode.id
  };
}

/**
 * Run 3-agent consensus with streaming (SSE)
 *
 * @param {string} task - The task description
 * @param {object} options - { agentConfig, onEvent }
 *   - agentConfig: Optional per-agent configuration override
 *   - onEvent: Callback function(eventName, data) for SSE events
 */
export async function runThoughtWorldStreaming(task, options = {}) {
  const { agentConfig: customConfig, onEvent, humanInput } = options;

  // Merge custom config with defaults
  const config = {
    forge: customConfig?.forge || AGENTS.forge,
    loom: customConfig?.loom || AGENTS.loom,
    anvil: customConfig?.anvil || AGENTS.anvil
  };

  const context = { humanInput: humanInput || null };

  try {
    // 1. FORGE PROPOSES (streaming)
    onEvent('forge_start', { agent: 'forge', role: 'executor', status: 'thinking' });

    const systemPrompt = await loadPrompt('executor');
    const userMessage = context.humanInput
      ? `Task: ${task}\n\nHuman context: ${context.humanInput}`
      : `Task: ${task}`;

    let forgeContent = '';
    const forgeStartTime = Date.now();

    const forgeFullContent = await callLLMStreaming(
      config.forge,
      systemPrompt,
      userMessage,
      4096,
      (chunk) => {
        forgeContent += chunk;
        onEvent('forge_chunk', { agent: 'forge', content: chunk });
      }
    );

    const executorResponse = {
      id: ulid(),
      agent: 'forge',
      role: 'executor',
      content: forgeFullContent,
      timestamp: new Date().toISOString()
    };

    onEvent('forge_done', {
      agent: 'forge',
      elapsed: Date.now() - forgeStartTime,
      tokens: forgeFullContent.length
    });

    // 2. LOOM REVIEWS (streaming)
    onEvent('loom_start', { agent: 'loom', role: 'verifier', status: 'reviewing' });

    const verifierPrompt = await loadPrompt('verifier');
    let verifierMessage = `Review this proposal from Forge (Executor):\n\n${executorResponse.content}\n\n`;
    verifierMessage += 'Your task: Identify what Forge missed, got wrong, or could improve. ';
    verifierMessage += 'Do NOT just rephrase—find genuine gaps or errors.';
    if (context.humanInput) {
      verifierMessage += `\n\nHuman input: ${context.humanInput}`;
    }

    let loomContent = '';
    const loomStartTime = Date.now();

    const loomFullContent = await callLLMStreaming(
      config.loom,
      verifierPrompt,
      verifierMessage,
      2048,
      (chunk) => {
        loomContent += chunk;
        onEvent('loom_chunk', { agent: 'loom', content: chunk });
      }
    );

    const verifierResponse = {
      id: ulid(),
      agent: 'loom',
      role: 'verifier',
      content: loomFullContent,
      executorId: executorResponse.id,
      timestamp: new Date().toISOString()
    };

    onEvent('loom_done', {
      agent: 'loom',
      elapsed: Date.now() - loomStartTime,
      tokens: loomFullContent.length
    });

    // 3. ANVIL DECIDES (streaming)
    onEvent('anvil_start', { agent: 'anvil', role: 'integrator', status: 'synthesizing' });

    const integratorPrompt = await loadPrompt('integrator');
    let integratorMessage = `Task: ${task}\n\n`;
    integratorMessage += `=== FORGE'S PROPOSAL ===\n${executorResponse.content}\n\n`;
    integratorMessage += `=== LOOM'S REVIEW ===\n${verifierResponse.content}\n\n`;
    integratorMessage += `Your task: Make the final consensus decision. Use the output format specified in your system prompt.`;
    if (context.humanInput) {
      integratorMessage += `\n\nHuman input: ${context.humanInput}`;
    }

    let anvilContent = '';
    const anvilStartTime = Date.now();

    const anvilFullContent = await callLLMStreaming(
      config.anvil,
      integratorPrompt,
      integratorMessage,
      2048,
      (chunk) => {
        anvilContent += chunk;
        onEvent('anvil_chunk', { agent: 'anvil', content: chunk });
      }
    );

    const integratorResponse = {
      id: ulid(),
      agent: 'anvil',
      role: 'integrator',
      content: anvilFullContent,
      executorId: executorResponse.id,
      verifierId: verifierResponse.id,
      timestamp: new Date().toISOString()
    };

    onEvent('anvil_done', {
      agent: 'anvil',
      elapsed: Date.now() - anvilStartTime,
      tokens: anvilFullContent.length
    });

    // 4. Parse consensus decision
    const consensus = parseConsensusDecision(integratorResponse);

    // 5. Log episode
    const episode = await logEpisode({
      task,
      executor: executorResponse,
      verifier: verifierResponse,
      integrator: integratorResponse,
      consensus,
      humanInput: context.humanInput
    });

    // 6. Send final consensus event
    onEvent('consensus', {
      decision: consensus.decision,
      success: consensus.decision === 'approved' || consensus.decision === 'approved_with_modifications',
      episodeId: episode.id,
      agents: {
        forge: executorResponse,
        loom: verifierResponse,
        anvil: integratorResponse
      }
    });

  } catch (error) {
    onEvent('error', {
      message: error?.message || String(error),
      stack: error?.stack
    });
    throw error;
  }
}
