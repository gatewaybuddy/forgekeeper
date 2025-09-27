import { gql } from 'graphql-tag';

const typeDefs = gql`
  scalar JSON

  type Message {
    id: ID!
    role: String!
    content: String!
    timestamp: String!
    tokens: Int
  }

  type Conversation {
    id: ID!
    title: String!
    folder: String!
    archived: Boolean!
    projectId: String
    messages: [Message!]!
  }

  type Folder {
    name: String!
    children: [Folder!]!
  }

  type Project {
    id: ID!
    name: String!
    description: String
    createdAt: String!
    updatedAt: String!
    conversations: [Conversation!]!
  }

  type Query {
    listConversations(projectId: ID): [Conversation!]!
    listFolders: [Folder!]!
    listProjects: [Project!]!
    project(id: ID!): Project
    getRuntimeConfig: JSON
    listGatewayNodes: [GatewayNode!]!
    routeModel(model: String!): GatewayNode

  }

  type Mutation {
    sendMessageToForgekeeper(topic: String!, message: JSON!, idempotencyKey: String, projectId: ID): Boolean!
    stopMessage(idempotencyKey: String): Boolean!
    moveConversationToFolder(conversationId: ID!, folder: String!): Boolean!
    deleteConversation(conversationId: ID!): Boolean!
    archiveConversation(conversationId: ID!): Boolean!
    createFolder(name: String!, parent: String): Boolean!
    renameFolder(oldName: String!, newName: String!): Boolean!
    appendMessage(conversationId: ID!, role: String!, content: String!): Boolean!

    createProject(name: String!, description: String): Project!
    updateProject(id: ID!, name: String, description: String): Project!
    deleteProject(id: ID!): Boolean!
    setRuntimeConfig(patch: JSON!): Boolean!
    requestRestart: Boolean!
    registerGatewayNode(id: String!, url: String!, models: [String!]!, capacity: Int): Boolean!
    updateGatewayNode(id: String!, queueDepth: Int, healthy: Boolean, models: [String!], capacity: Int): Boolean!
    drainGatewayNode(id: String!, drain: Boolean!): Boolean!

  }

  type GatewayNode {
    id: ID!
    url: String!
    models: [String!]!
    capacity: Int!
    queueDepth: Int!
    healthy: Boolean!
    drain: Boolean!
    lastSeen: String!
  }
`;

export default typeDefs;
