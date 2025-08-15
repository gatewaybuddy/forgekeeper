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

  type Project {
    id: ID!
    name: String!
    description: String
  }

  type Folder {
    name: String!
    children: [Folder!]!
  }

  type Query {
    listConversations(projectId: ID): [Conversation!]!
    listFolders: [Folder!]!
    listProjects: [Project!]!
  }

  type Mutation {
    sendMessageToForgekeeper(topic: String!, message: JSON!, idempotencyKey: String, projectId: ID): Boolean!
    stopMessage(idempotencyKey: String): Boolean!
    moveConversationToFolder(conversationId: ID!, folder: String!): Boolean!
    deleteConversation(conversationId: ID!): Boolean!
    archiveConversation(conversationId: ID!): Boolean!
    createFolder(name: String!, parent: String): Boolean!
    renameFolder(oldName: String!, newName: String!): Boolean!
    createProject(name: String!): Project!
  }
`;

export default typeDefs;
