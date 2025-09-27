import { useEffect, useReducer, useState } from 'react';
import { Conversation } from '../../types';
import { useConversationService } from './services/conversationService';
import { handleSlashCommand } from './services/slashCommands';

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
  const {
    conversations: remoteConversations,
    loading,
    sending,
    stopping,
    sendMessage: sendMessageTransport,
    stopMessage: stopMessageTransport,
    moveConversation: moveConversationTransport,
    deleteConversation: deleteConversationTransport,
    archiveConversation: archiveConversationTransport,
    setRuntimeConfig,
  } = useConversationService(projectId);

  const [conversations, dispatch] = useReducer(conversationReducer, []);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    dispatch({ type: 'set', payload: remoteConversations });
    if (remoteConversations.length > 0) {
      setSelected(remoteConversations[0].id);
    } else {
      setSelected(null);
    }
  }, [remoteConversations, projectId]);

  const moveConversation = async (id: string, folder: string) => {
    await moveConversationTransport(id, folder);
    dispatch({ type: 'move', id, folder });
  };

  const deleteConversation = async (id: string) => {
    await deleteConversationTransport(id);
    dispatch({ type: 'delete', id });
  };

  const archiveConversation = async (id: string) => {
    await archiveConversationTransport(id);
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
    if (!content) return;

    const handled = await handleSlashCommand(content, {
      alert: message => window.alert(message),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key),
      reload: () => window.location.reload(),
      pushRuntimeConfig: patch => setRuntimeConfig(patch),
    });

    if (handled) return;
    if (!projectId) return;

    await sendMessageTransport(content);
  };

  const stop = async () => {
    await stopMessageTransport();
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
