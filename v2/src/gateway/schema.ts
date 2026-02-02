/**
 * GraphQL Schema Definition
 * Compatible with existing frontend
 */

export const typeDefs = `#graphql
  # Scalar types
  scalar JSON
  scalar DateTime

  # Core types
  type Session {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    workspace: Workspace!
    config: JSON!
    status: String!
    messages: [Message!]!
    events: [Event!]!
    metrics: MetricSnapshot
  }

  type Message {
    id: ID!
    createdAt: DateTime!
    role: String!
    content: String!
    source: String
    promptTokens: Int!
    completionTokens: Int!
    totalTokens: Int!
    cost: Float!
  }

  type Event {
    id: ID!
    createdAt: DateTime!
    type: String!
    data: JSON!
    actor: String
    iteration: Int
  }

  type MetricSnapshot {
    id: ID!
    createdAt: DateTime!
    integrationScore: Float!
    agentParticipation: JSON!
    challengesIssued: Int!
    responsesReceived: Int!
    limitationsOverturned: Int!
    tokenUsage: Int!
    hypothesesCount: Int!
    decisionsCount: Int!
    iterationCount: Int!
    avgIterationDuration: Float!
    scoutChallenges: Int!
    attemptsCatalyzed: Int!
    successfulAttempts: Int!
  }

  # Workspace types
  type Workspace {
    currentFocus: String!
    hypotheses: [Hypothesis!]!
    decisions: [Decision!]!
    toolResults: [ToolResult!]!
    episodicMatches: [EpisodicMatch!]!
    pendingChallenges: [Challenge!]!
    tokenCount: Int!
    iteration: Int!
  }

  type Hypothesis {
    content: String!
    confidence: Float!
    source: String!
    timestamp: Float!
  }

  type Decision {
    content: String!
    rationale: String!
    source: String!
    isFinal: Boolean!
    timestamp: Float!
  }

  type ToolResult {
    toolName: String!
    result: String!
    success: Boolean!
    timestamp: Float!
  }

  type EpisodicMatch {
    sessionId: String!
    summary: String!
    similarity: Float!
  }

  type Challenge {
    from: String!
    to: String!
    content: String!
    targetHypothesis: String
    timestamp: Float!
    responded: Boolean!
  }

  # Proposal types
  type Proposal {
    type: String!
    content: String!
    source: String!
    confidence: Float
    score: Float
    rationale: String
    isFinal: Boolean
    toolName: String
    success: Boolean
    targetAgent: String
    targetHypothesis: String
  }

  # Agent types
  type Agent {
    name: String!
    role: String!
    model: String!
    available: Boolean!
  }

  type AgentStatus {
    forge: Agent!
    loom: Agent!
    anvil: Agent!
    scout: Agent!
  }

  # Provider types
  type ProviderHealth {
    available: Boolean!
    latencyMs: Int
    error: String
  }

  type ProviderStatus {
    localQwen: ProviderHealth!
    claude: ProviderHealth
  }

  # Metrics types
  type ConsciousnessMetrics {
    integrationScore: Float!
    agentParticipation: JSON!
    challengeActivity: JSON!
    workspaceUtilization: JSON!
    iterationMetrics: JSON!
    coherenceScore: Float!
  }

  type ScoutMetrics {
    challengesIssued: Int!
    challengesResponded: Int!
    attemptsCatalyzed: Int!
    limitationsOverturned: Int!
    averageResponseTime: Float!
    successRate: Float!
    topChallengedAgents: [AgentChallenge!]!
  }

  type AgentChallenge {
    agent: String!
    count: Int!
  }

  type DashboardMetrics {
    consciousness: ConsciousnessMetrics!
    scout: ScoutMetrics!
    timestamp: Float!
    sessionId: String!
  }

  type SystemMetrics {
    activeSessions: Int!
    totalSessions: Int!
    averageIntegrationScore: Float!
    totalChallenges: Int!
    uptime: Float!
  }

  # Orchestration types
  type OrchestrateResult {
    sessionId: String!
    iterations: Int!
    finalDecision: String
    workspace: Workspace!
    metrics: OrchestrateMetrics!
  }

  type OrchestrateMetrics {
    integrationScore: Float!
    challengesIssued: Int!
    attemptsMatched: Int!
  }

  # Input types
  input OrchestrateInput {
    sessionId: String
    userMessage: String!
    maxIterations: Int
  }

  # Tool types
  type ToolDefinition {
    name: String!
    description: String!
    parameters: JSON!
  }

  type ToolExecutionResult {
    success: Boolean!
    output: JSON
    error: String
    executionTime: Float
    truncated: Boolean
  }

  # Queries
  type Query {
    # Sessions
    session(id: ID!): Session
    sessions(limit: Int, offset: Int): [Session!]!

    # Tools
    tools: [ToolDefinition!]!
    tool(name: String!): ToolDefinition

    # Workspace
    workspace(sessionId: ID!): Workspace

    # Agents
    agentStatus: AgentStatus!

    # Providers
    providerStatus: ProviderStatus!

    # Metrics
    consciousnessMetrics(sessionId: ID!): DashboardMetrics
    systemMetrics: SystemMetrics!
    topSessions(limit: Int): [DashboardMetrics!]!

    # Health
    health: String!

    # Testing
    testingInstructions: String!
  }

  # Mutations
  type Mutation {
    # Orchestration
    orchestrate(input: OrchestrateInput!): OrchestrateResult!

    # Session management
    createSession: Session!
    deleteSession(id: ID!): Boolean!

    # Tool execution
    executeTool(name: String!, args: JSON!, sessionId: String): ToolExecutionResult!
  }

  # Subscriptions
  type Subscription {
    # Real-time workspace updates
    workspaceUpdates(sessionId: ID!): Workspace!

    # Real-time metrics
    metricsUpdates(sessionId: ID!): DashboardMetrics!

    # Consciousness stream
    consciousnessStream: DashboardMetrics!
  }
`;
