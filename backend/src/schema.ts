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

  type Query {
    listConversations: [Conversation!]!
    listFolders: [Folder!]!
  }

  type Mutation {
    sendMessageToForgekeeper(topic: String!, message: JSON!): Boolean!
    stopMessage: Boolean!
    moveConversationToFolder(conversationId: ID!, folder: String!): Boolean!
    deleteConversation(conversationId: ID!): Boolean!
    archiveConversation(conversationId: ID!): Boolean!
    createFolder(name: String!, parent: String): Boolean!
    renameFolder(oldName: String!, newName: String!): Boolean!
  }
`;

export default typeDefs;
