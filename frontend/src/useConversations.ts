import { useState, useReducer, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
  SEND_MESSAGE,
  STOP_MESSAGE,
  LIST_CONVERSATIONS,
  MOVE_CONVERSATION,
  DELETE_CONVERSATION,
  ARCHIVE_CONVERSATION,
} from './graphql';
import { Conversation } from './types';

 type ConversationAction =
  | { type: 'set'; payload: Conversation[] }
  | { type: 'move'; id: string; folder: string }
  | { type: 'delete'; id: string }
  | { type: 'archive'; id: string };

const conversationReducer = (
  state: Conversation[],
  action: ConversationAction
): Conversation[] => {
  switch (action.type) {
    case 'set':
      return action.payload;
    case 'move':
      return state.map(c => (c.id === action.id ? { ...c, folder: action.folder } : c));
    case 'delete':
    case 'archive':
      return state.filter(c => c.id !== action.id);
    default:
      return state;
  }
};

export function useConversations(projectId: string | null) {
  const { data, loading, refetch } = useQuery(LIST_CONVERSATIONS, {
    variables: { projectId },
    skip: !projectId,
  });
  const [conversations, dispatch] = useReducer(conversationReducer, []);
  const [selected, setSelected] = useState<string | null>(null);

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted: () => {
      refetch();
    },
  });
  const [stopMessage, { loading: stopping }] = useMutation(STOP_MESSAGE);
  const [moveConv] = useMutation(MOVE_CONVERSATION);
  const [deleteConv] = useMutation(DELETE_CONVERSATION);
  const [archiveConv] = useMutation(ARCHIVE_CONVERSATION);

  useEffect(() => {
    if (data?.listConversations) {
      dispatch({ type: 'set', payload: data.listConversations });
      if (data.listConversations.length > 0) {
        setSelected(data.listConversations[0].id);
      } else {
        setSelected(null);
      }
    }
  }, [data, projectId]);

  const moveConversation = async (id: string, folder: string) => {
    await moveConv({ variables: { conversationId: id, folder } });
    dispatch({ type: 'move', id, folder });
  };

  const deleteConversation = async (id: string) => {
    await deleteConv({ variables: { conversationId: id } });
    dispatch({ type: 'delete', id });
  };

  const archiveConversation = async (id: string) => {
    await archiveConv({ variables: { conversationId: id } });
    dispatch({ type: 'archive', id });
  };

  const renameFolder = (oldName: string, newName: string) => {
    dispatch({
      type: 'set',
      payload: conversations.map(c =>
        c.folder === oldName ? { ...c, folder: newName } : c
      ),
    });
  };

  const send = async (content: string) => {
    if (!content || !projectId) return;
    await sendMessage({
      variables: {
        topic: 'forgekeeper/task',
        message: { content },
      },
    });
  };

  const stop = async () => {
    await stopMessage();
  };

  const selectedConv = conversations.find(c => c.id === selected) || null;

  return {
    conversations,
    selected,
    setSelected,
    selectedConv,
    loading,
    send,
    stop,
    moveConversation,
    deleteConversation,
    archiveConversation,
    renameFolder,
    sending,
    stopping,
  };
}

export default useConversations;
