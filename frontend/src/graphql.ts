import { gql } from '@apollo/client';

export const SEND_MESSAGE = gql`
  mutation SendMessage($topic: String!, $message: JSON!) {
    sendMessageToForgekeeper(topic: $topic, message: $message)
  }
`;

export const STOP_MESSAGE = gql`
  mutation StopMessage {
    stopMessage
  }
`;

export const LIST_CONVERSATIONS = gql`
  query ListConversations {
    listConversations {
      id
      title
      folder
      messages {
        id
        role
        content
        timestamp
      }
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
