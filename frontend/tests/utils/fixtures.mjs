/**
 * Test Fixtures
 *
 * Common test data and fixtures for unit and integration tests.
 */

/**
 * Sample agent state for testing
 */
export const mockAgentState = {
  task: 'Test task: implement feature X',
  iteration: 1,
  maxIterations: 20,
  history: [],
  reflectionHistory: [],
  toolResults: [],
  errors: [],
  reflectionAccuracy: [],
  planningFeedback: [],
  currentPhase: 1,
  isComplete: false,
  result: null
};

/**
 * Sample reflection for testing
 */
export const mockReflection = {
  assessment: 'continue',
  progress_percent: 30,
  confidence: 0.75,
  next_action: 'use_tool',
  reasoning: 'Need to execute bash command to check status',
  tool_plan: {
    tool: 'bash',
    purpose: 'Check file status'
  },
  observations: [
    'File does not exist yet',
    'Need to create it first'
  ],
  prediction: 'Command will create file successfully'
};

/**
 * Sample successful tool result
 */
export const mockToolResult = {
  tool: 'bash',
  args: { command: 'ls -la' },
  output: 'total 0\ndrwxr-xr-x  2 user  group  64 Dec 15 10:00 .\ndrwxr-xr-x  4 user  group 128 Dec 15 09:00 ..',
  success: true,
  error: null,
  elapsed_ms: 45
};

/**
 * Sample failed tool result
 */
export const mockFailedToolResult = {
  tool: 'bash',
  args: { command: 'invalid-command' },
  output: '',
  success: false,
  error: 'Command not found: invalid-command',
  elapsed_ms: 10
};

/**
 * Sample memory data
 */
export const mockMemories = {
  pastLearnings: [
    {
      task_type: 'implementation',
      pattern: 'Always check file exists before modifying',
      success_rate: 0.95,
      sample_count: 20
    },
    {
      task_type: 'implementation',
      pattern: 'Use grep to search before sed to replace',
      success_rate: 0.88,
      sample_count: 15
    }
  ],
  pastFailures: [
    {
      task_type: 'implementation',
      pattern: 'Modifying files without backing up',
      failure_rate: 0.75,
      sample_count: 8
    }
  ],
  learningGuidance: 'When implementing features:\n- Always verify file exists\n- Create backups before modifications\n- Test changes incrementally',
  relevantEpisodes: [
    {
      task: 'Add logging to authentication module',
      outcome: 'success',
      key_actions: ['Read file', 'Find insertion point', 'Add import', 'Add log statements', 'Test'],
      reflection: 'Incremental testing prevented errors'
    }
  ],
  userPreferenceGuidance: 'User prefers:\n- TypeScript strict mode\n- Functional components over class components\n- ESLint compliance',
  toolRecommendations: [
    {
      tool: 'read_file',
      task_type: 'implementation',
      effectiveness: 0.92,
      use_count: 150
    },
    {
      tool: 'bash',
      task_type: 'implementation',
      effectiveness: 0.85,
      use_count: 120
    }
  ]
};

/**
 * Sample checkpoint data
 */
export const mockCheckpoint = {
  id: 'checkpoint-123',
  session_id: 'session-abc',
  timestamp: Date.now(),
  iteration: 5,
  state: { ...mockAgentState, iteration: 5 },
  config: {
    maxIterations: 20,
    checkpointInterval: 5,
    errorThreshold: 3,
    model: 'test-model'
  }
};

/**
 * Sample task types
 */
export const mockTaskTypes = {
  implementation: 'Test implementation task',
  bugfix: 'Test bug fix task',
  refactoring: 'Test refactoring task',
  documentation: 'Test documentation task',
  testing: 'Test testing task'
};

/**
 * Sample LLM messages
 */
export const mockMessages = {
  systemPrompt: 'You are a helpful AI assistant.',
  userMessage: {
    role: 'user',
    content: 'Please help me implement feature X'
  },
  assistantMessage: {
    role: 'assistant',
    content: 'I will help you implement feature X. Let me start by checking the codebase.'
  }
};

/**
 * Sample alternatives for Phase 6
 */
export const mockAlternatives = [
  {
    id: 'alt-1',
    approach: 'Use bash grep to find files',
    estimated_effort: 2,
    estimated_risk: 0.2,
    alignment_score: 0.85,
    pros: ['Fast', 'Simple'],
    cons: ['May miss some edge cases'],
    total_score: 0.78
  },
  {
    id: 'alt-2',
    approach: 'Use find command with exec',
    estimated_effort: 3,
    estimated_risk: 0.3,
    alignment_score: 0.90,
    pros: ['More comprehensive', 'Better control'],
    cons: ['Slower', 'More complex'],
    total_score: 0.75
  },
  {
    id: 'alt-3',
    approach: 'Read directory and filter in memory',
    estimated_effort: 4,
    estimated_risk: 0.4,
    alignment_score: 0.70,
    pros: ['Full control', 'Can do complex filtering'],
    cons: ['Memory intensive', 'Slower for large dirs'],
    total_score: 0.60
  }
];

/**
 * Sample task graph for Phase 7
 */
export const mockTaskGraph = {
  nodes: [
    {
      id: 'step-1',
      action: 'Read file',
      tool: 'read_file',
      args: { path: 'test.js' }
    },
    {
      id: 'step-2',
      action: 'Modify file',
      tool: 'write_file',
      args: { path: 'test.js', content: '...' },
      dependencies: ['step-1']
    },
    {
      id: 'step-3',
      action: 'Run tests',
      tool: 'bash',
      args: { command: 'npm test' },
      dependencies: ['step-2']
    }
  ],
  edges: [
    { from: 'step-1', to: 'step-2' },
    { from: 'step-2', to: 'step-3' }
  ]
};

/**
 * Sample diagnostic reflection (5 Whys)
 */
export const mockDiagnosticReflection = {
  error: 'File not found: config.json',
  why_chain: [
    'Why did the file not exist? → File was not created yet',
    'Why was it not created? → Previous step failed',
    'Why did previous step fail? → Wrong directory',
    'Why was directory wrong? → Incorrect path in command',
    'Why was path incorrect? → Assumed default location'
  ],
  root_cause: 'Assumed default location without verification',
  recovery_strategy: 'Verify file exists before attempting to read, or create with defaults if missing'
};

/**
 * Sample accuracy tracking data
 */
export const mockAccuracyData = [
  { predicted: 'success', actual: 'success', confidence: 0.9 },
  { predicted: 'success', actual: 'success', confidence: 0.85 },
  { predicted: 'failure', actual: 'success', confidence: 0.6 },  // Wrong prediction
  { predicted: 'success', actual: 'success', confidence: 0.95 },
  { predicted: 'success', actual: 'failure', confidence: 0.7 }   // Wrong prediction
];

/**
 * Mock session memory
 */
export function createMockSessionMemory() {
  return {
    getSuccessfulPatterns: async (taskType) => mockMemories.pastLearnings,
    getFailurePatterns: async (taskType) => mockMemories.pastFailures,
    getGuidance: async (taskType) => mockMemories.learningGuidance,
    recordOutcome: async (outcome) => { /* no-op */ },
    recordSession: async (sessionData) => { /* no-op */ }
  };
}

/**
 * Mock episodic memory
 */
export function createMockEpisodicMemory() {
  return {
    search: async (query, limit = 3) => mockMemories.relevantEpisodes.slice(0, limit),
    searchSimilar: async (query, options = {}) => mockMemories.relevantEpisodes.slice(0, options.limit || 3),
    recordEpisode: async (episode) => { /* no-op */ },
    add: async (episode) => { /* no-op */ },
    size: async () => mockMemories.relevantEpisodes.length
  };
}

/**
 * Mock preference system
 */
export function createMockPreferenceSystem() {
  return {
    generatePreferenceGuidance: async () => mockMemories.userPreferenceGuidance,
    getGuidance: async (category = null) => mockMemories.userPreferenceGuidance,
    inferFromCodebase: async () => { /* no-op */ },
    getUserPreferences: async () => ({
      code_style: { typescript: 'strict', components: 'functional' },
      tools: { preferred: ['read_file', 'bash'] },
      workflow: { testing: 'incremental' }
    })
  };
}

/**
 * Mock tool effectiveness tracker
 */
export function createMockToolEffectiveness() {
  return {
    getRecommendations: async (taskType) => mockMemories.toolRecommendations,
    recordUsage: async (tool, success, elapsed_ms) => { /* no-op */ },
    getStats: async (tool) => ({
      use_count: 50,
      success_rate: 0.9,
      avg_time_ms: 120
    })
  };
}
