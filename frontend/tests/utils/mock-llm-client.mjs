/**
 * Mock LLM Client for Testing
 *
 * Provides a configurable mock for LLM API calls to avoid external dependencies in tests.
 * Can return predefined responses or use custom response handlers.
 */

export class MockLLMClient {
  constructor(options = {}) {
    this.responses = options.responses || [];
    this.responseIndex = 0;
    this.customHandler = options.customHandler || null;
    this.callHistory = [];
  }

  /**
   * Mock chat.completions.create method
   * @param {Object} params - Chat completion parameters
   * @returns {Object} Mock response
   */
  async create(params) {
    // Record the call
    this.callHistory.push({
      timestamp: Date.now(),
      params: JSON.parse(JSON.stringify(params))
    });

    // Use custom handler if provided
    if (this.customHandler) {
      return this.customHandler(params, this.callHistory.length - 1);
    }

    // Use predefined responses
    if (this.responseIndex < this.responses.length) {
      const response = this.responses[this.responseIndex];
      this.responseIndex++;
      return response;
    }

    // Default response
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            assessment: 'continue',
            progress_percent: 0,
            confidence: 0.5,
            next_action: 'noop',
            reasoning: 'default mock response'
          })
        }
      }]
    };
  }

  /**
   * Reset the mock client state
   */
  reset() {
    this.responseIndex = 0;
    this.callHistory = [];
  }

  /**
   * Get the number of calls made
   */
  getCallCount() {
    return this.callHistory.length;
  }

  /**
   * Get a specific call from history
   */
  getCall(index) {
    return this.callHistory[index];
  }

  /**
   * Get the last call made
   */
  getLastCall() {
    return this.callHistory[this.callHistory.length - 1];
  }
}

/**
 * Create a mock LLM client with chat.completions API structure
 */
export function createMockLLMClient(options = {}) {
  const mockClient = new MockLLMClient(options);

  return {
    chat: {
      completions: {
        create: (params) => mockClient.create(params)
      }
    },
    // Expose mock utilities
    _mock: {
      reset: () => mockClient.reset(),
      getCallCount: () => mockClient.getCallCount(),
      getCall: (index) => mockClient.getCall(index),
      getLastCall: () => mockClient.getLastCall(),
      getCallHistory: () => mockClient.callHistory
    }
  };
}

/**
 * Create a mock reflection response
 */
export function createMockReflection(overrides = {}) {
  return {
    assessment: overrides.assessment || 'continue',
    progress_percent: overrides.progress_percent ?? 50,
    confidence: overrides.confidence ?? 0.7,
    next_action: overrides.next_action || 'use_tool',
    reasoning: overrides.reasoning || 'Test reasoning',
    tool_plan: overrides.tool_plan || {
      tool: 'bash',
      purpose: 'test execution'
    },
    observations: overrides.observations || ['Test observation'],
    prediction: overrides.prediction || 'Expected outcome'
  };
}

/**
 * Create a mock completion response
 */
export function createMockCompletion(content, overrides = {}) {
  return {
    id: overrides.id || 'mock-completion-id',
    object: 'chat.completion',
    created: overrides.created || Date.now(),
    model: overrides.model || 'mock-model',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: typeof content === 'string' ? content : JSON.stringify(content)
      },
      finish_reason: overrides.finish_reason || 'stop'
    }],
    usage: overrides.usage || {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150
    }
  };
}

/**
 * Create a series of mock responses for multi-turn conversations
 */
export function createMockConversation(turns) {
  return turns.map(turn => {
    if (typeof turn === 'string') {
      return createMockCompletion(turn);
    } else if (turn.reflection) {
      return createMockCompletion(createMockReflection(turn.reflection));
    } else {
      return createMockCompletion(turn.content, turn);
    }
  });
}
