/**
 * Configuration management with validation
 */
import { z } from 'zod';

const configSchema = z.object({
  // Database
  databaseUrl: z.string().default('file:./dev.db'),

  // Local inference
  localQwenUrl: z.string().url().default('http://127.0.0.1:8080'),
  localQwenModel: z.string().default('qwen3-coder-32b'),
  preferLocalInference: z.boolean().default(true),

  // Anthropic API
  anthropicApiKey: z.string().optional(),

  // OpenAI API (fallback)
  openaiApiKey: z.string().optional(),

  // Server
  port: z.coerce.number().default(4000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),

  // Workspace limits
  maxWorkspaceTokens: z.coerce.number().default(4000),
  maxHypotheses: z.coerce.number().default(5),
  maxDecisions: z.coerce.number().default(10),
  maxToolResults: z.coerce.number().default(10),

  // Orchestration
  maxIterations: z.coerce.number().default(10),
  parallelProposals: z.boolean().default(true),

  // Model names
  opusModel: z.string().default('claude-opus-4-5-20251101'),
  sonnetModel: z.string().default('claude-sonnet-4-5-20250929'),
  haikuModel: z.string().default('claude-haiku-4-5-20250815'),

  // Extended thinking
  enableExtendedThinking: z.boolean().default(true),
  maxThinkingTokens: z.coerce.number().default(10000),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const env = {
    // Database
    databaseUrl: process.env.DATABASE_URL,

    // Local inference
    localQwenUrl: process.env.LOCAL_QWEN_URL,
    localQwenModel: process.env.LOCAL_QWEN_MODEL,
    preferLocalInference: process.env.PREFER_LOCAL_INFERENCE === 'true',

    // API keys
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,

    // Server
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,

    // Workspace limits
    maxWorkspaceTokens: process.env.MAX_WORKSPACE_TOKENS,
    maxHypotheses: process.env.MAX_HYPOTHESES,
    maxDecisions: process.env.MAX_DECISIONS,
    maxToolResults: process.env.MAX_TOOL_RESULTS,

    // Orchestration
    maxIterations: process.env.MAX_ITERATIONS,
    parallelProposals: process.env.PARALLEL_PROPOSALS === 'true',

    // Model names
    opusModel: process.env.OPUS_MODEL,
    sonnetModel: process.env.SONNET_MODEL,
    haikuModel: process.env.HAIKU_MODEL,

    // Extended thinking
    enableExtendedThinking: process.env.ENABLE_EXTENDED_THINKING === 'true',
    maxThinkingTokens: process.env.MAX_THINKING_TOKENS,
  };

  return configSchema.parse(env);
}

export const config = loadConfig();
