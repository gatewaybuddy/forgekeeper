import { useMutation, useQuery } from '@apollo/client';
import {
  SEND_MESSAGE,
  STOP_MESSAGE,
  LIST_CONVERSATIONS,
  MOVE_CONVERSATION,
  DELETE_CONVERSATION,
  ARCHIVE_CONVERSATION,
  SET_RUNTIME_CONFIG,
} from '../../graphql';
import { Conversation } from '../../types';

export interface ConversationTransport {
  conversations: Conversation[];
  loading: boolean;
  sending: boolean;
  stopping: boolean;
  sendMessage: (content: string) => Promise<void>;
  stopMessage: () => Promise<void>;
  moveConversation: (id: string, folder: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  setRuntimeConfig: (patch: Record<string, unknown>) => Promise<void>;
}

export function useConversationService(projectId: string | null): ConversationTransport {
  const { data, loading, refetch } = useQuery(LIST_CONVERSATIONS, {
    variables: { projectId },
    skip: !projectId,
  });

  const [sendMutation, sendState] = useMutation(SEND_MESSAGE, {
    onCompleted: () => {
      if (projectId) {
        refetch();
      }
    },
  });
  const [stopMutation, stopState] = useMutation(STOP_MESSAGE);
  const [moveMutation] = useMutation(MOVE_CONVERSATION);
  const [deleteMutation] = useMutation(DELETE_CONVERSATION);
  const [archiveMutation] = useMutation(ARCHIVE_CONVERSATION);
  const [setRuntimeConfigMutation] = useMutation(SET_RUNTIME_CONFIG);

  return {
    conversations: data?.listConversations ?? [],
    loading,
    sending: sendState.loading,
    stopping: stopState.loading,
    sendMessage: async (content: string) => {
      await sendMutation({
        variables: {
          topic: 'forgekeeper/task',
          message: { content },
        },
      });
    },
    stopMessage: async () => {
      await stopMutation();
    },
    moveConversation: async (id: string, folder: string) => {
      await moveMutation({
        variables: { conversationId: id, folder },
      });
    },
    deleteConversation: async (id: string) => {
      await deleteMutation({
        variables: { conversationId: id },
      });
    },
    archiveConversation: async (id: string) => {
      await archiveMutation({
        variables: { conversationId: id },
      });
    },
    setRuntimeConfig: async (patch: Record<string, unknown>) => {
      await setRuntimeConfigMutation({
        variables: { patch },
      });
    },
  };
}

export default useConversationService;
