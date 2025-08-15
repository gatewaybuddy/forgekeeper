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
    listConversations: [Conversation!]!
    listFolders: [Folder!]!
    listProjects: [Project!]!
    project(id: ID!): Project
  }

  type Mutation {
    sendMessageToForgekeeper(topic: String!, message: JSON!, idempotencyKey: String): Boolean!
    stopMessage(idempotencyKey: String): Boolean!
    moveConversationToFolder(conversationId: ID!, folder: String!): Boolean!
    deleteConversation(conversationId: ID!): Boolean!
    archiveConversation(conversationId: ID!): Boolean!
    createFolder(name: String!, parent: String): Boolean!
    renameFolder(oldName: String!, newName: String!): Boolean!
    createProject(name: String!, description: String): Project!
    updateProject(id: ID!, name: String, description: String): Project!
    deleteProject(id: ID!): Boolean!
  }
`;

export default typeDefs;
