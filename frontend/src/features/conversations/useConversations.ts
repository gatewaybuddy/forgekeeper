import { useState, useReducer, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
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
  const [setRuntimeConfig] = useMutation(SET_RUNTIME_CONFIG);

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
    if (!content) return;
    // Slash-command handling (client-side config UX)
    if (content.trim().startsWith('/')) {
      const [cmdRaw, ...rest] = content.trim().slice(1).split(/\s+/);
      const cmd = (cmdRaw || '').toLowerCase();
      const arg = rest.join(' ').trim();
      const ok = (msg: string) => window.alert(msg);
      switch (cmd) {
        case 'model': localStorage.setItem('fk_model', arg || ''); ok(`Model set to: ${arg}`); break;
        case 'temperature': localStorage.setItem('fk_temperature', arg || ''); ok(`Temperature: ${arg}`); break;
        case 'top_p': localStorage.setItem('fk_top_p', arg || ''); ok(`top_p: ${arg}`); break;
        case 'backend': localStorage.setItem('fk_backend', arg || ''); ok(`Backend: ${arg}`); break;
        case 'gateway': localStorage.setItem('fk_gateway', arg || ''); ok(`Gateway: ${arg}`); break;
        case 'project': ok('Use the Project selector in the sidebar to switch projects.'); break;
        case 'context':
          if (arg === 'on' || arg === 'off') {
            localStorage.setItem('fk_show_context', arg);
            ok(`Context counter: ${arg}`);
          } else if (arg) {
            localStorage.setItem('fk_context_limit', arg);
            ok(`Context limit: ${arg}`);
          } else {
            ok('Usage: /context on|off or /context <limit>');
          }
          break;
        case 'reset':
          ['fk_model','fk_temperature','fk_top_p','fk_backend','fk_gateway','fk_show_context','fk_context_limit'].forEach(k => localStorage.removeItem(k));
          ok('Settings reset to defaults.');
          break;
        case 'restart':
          ok('Reloading UI to apply changes...');
          window.location.reload();
          break;
        case 'help':
          ok('/model <name>\n/temperature <0..2>\n/top_p <0..1>\n/backend <openai|transformers>\n/gateway <url>\n/context on|off|<limit>\n/restart\n/reset');
          break;
        default:
          ok(`Unknown command: /${cmd}`);
      }
      // Push partial config to backend so the agent can pick it up
      const patch: Record<string, any> = {};
      if (cmd === 'model') patch.model = arg;
      if (cmd === 'temperature') patch.temperature = Number(arg);
      if (cmd === 'top_p') patch.top_p = Number(arg);
      if (cmd === 'backend') patch.backend = arg;
      if (cmd === 'gateway') patch.gateway = arg;
      if (cmd === 'context') {
        if (arg === 'on' || arg === 'off') patch.show_context = arg;
        else if (arg) patch.context_limit = Number(arg);
      }
      if (Object.keys(patch).length > 0) {
        try { await setRuntimeConfig({ variables: { patch } }); } catch {}
      }
      return;
    }
    if (!projectId) return;
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
