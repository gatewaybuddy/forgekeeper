import { gql } from '@apollo/client';

export const SEND_MESSAGE = gql`
  mutation SendMessage($topic: String!, $message: JSON!, $projectId: ID) {
    sendMessageToForgekeeper(topic: $topic, message: $message, projectId: $projectId)
  }
`;

export const STOP_MESSAGE = gql`
  mutation StopMessage {
    stopMessage
  }
`;

export const LIST_CONVERSATIONS = gql`
  query ListConversations($projectId: ID) {
    listConversations(projectId: $projectId) {
      id
      title
      folder
      projectId
      messages {
        id
        role
        content
        timestamp
      }
    }
  }
`;

export const LIST_PROJECTS = gql`
  query ListProjects {
    listProjects {
      id
      name
      description
    }
  }
`;

export const CREATE_PROJECT = gql`
  mutation CreateProject($name: String!) {
    createProject(name: $name) {
      id
      name
      description
    }
  }
`;

export const MOVE_CONVERSATION = gql`
  mutation MoveConversation($conversationId: ID!, $folder: String!) {
    moveConversationToFolder(conversationId: $conversationId, folder: $folder)
  }
`;

export const DELETE_CONVERSATION = gql`
  mutation DeleteConversation($conversationId: ID!) {
    deleteConversation(conversationId: $conversationId)
  }
`;

export const ARCHIVE_CONVERSATION = gql`
  mutation ArchiveConversation($conversationId: ID!) {
    archiveConversation(conversationId: $conversationId)
  }
`;

export const GET_RUNTIME_CONFIG = gql`
  query GetRuntimeConfig {
    getRuntimeConfig
  }
`;

export const SET_RUNTIME_CONFIG = gql`
  mutation SetRuntimeConfig($patch: JSON!) {
    setRuntimeConfig(patch: $patch)
  }
`;
