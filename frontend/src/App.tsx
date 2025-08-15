import React, { useState, useEffect, useReducer } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
  SEND_MESSAGE,
  STOP_MESSAGE,
  LIST_CONVERSATIONS,
  MOVE_CONVERSATION,
  DELETE_CONVERSATION,
  ARCHIVE_CONVERSATION,
} from './graphql';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  CssBaseline,
} from '@mui/material';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Conversation } from './types';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';
import PromptInput from './PromptInput';
import FolderTree from './FolderTree';
import ContextMenu from './ContextMenu';
import SyncIndicator from './SyncIndicator';
import LogPanel from './LogPanel';
import { setErrorHandler } from './toast';
import ProjectSelector from './ProjectSelector';
import { projectIdVar } from './apolloClient';

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

type FolderAction =
  | { type: 'set'; payload: string[] }
  | { type: 'add'; name: string }
  | { type: 'rename'; oldName: string; newName: string };

const folderReducer = (state: string[], action: FolderAction): string[] => {
  switch (action.type) {
    case 'set':
      return action.payload;
    case 'add':
      return state.includes(action.name) ? state : [...state, action.name];
    case 'rename':
      return state.map(f => (f === action.oldName ? action.newName : f));
    default:
      return state;
  }
};

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const { data, loading: convLoading, refetch } = useQuery(LIST_CONVERSATIONS, {
    variables: { projectId },
    skip: !projectId,
  });
  const [conversations, dispatchConvs] = useReducer(conversationReducer, []);
  const [folders, dispatchFolders] = useReducer(folderReducer, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [contextConv, setContextConv] = useState<Conversation | null>(null);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState(prefersDark);
  const [error, setError] = useState<string | null>(null);

  const theme = createTheme({ palette: { mode: darkMode ? 'dark' : 'light' } });

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted: () => {
      refetch();
      setPrompt('');
    },
  });
  const [stopMessage, { loading: stopping }] = useMutation(STOP_MESSAGE);
  const [moveConversation] = useMutation(MOVE_CONVERSATION);
  const [deleteConversation] = useMutation(DELETE_CONVERSATION);
  const [archiveConversation] = useMutation(ARCHIVE_CONVERSATION);

  useEffect(() => {
    setErrorHandler(msg => setError(msg));
  }, []);

  useEffect(() => {
    projectIdVar(projectId);
  }, [projectId]);

  useEffect(() => {
    if (data?.listConversations) {
      dispatchConvs({ type: 'set', payload: data.listConversations });
      const uniq = Array.from(
        new Set(data.listConversations.map((c: Conversation) => c.folder).filter(Boolean))
      );
      dispatchFolders({ type: 'set', payload: uniq });
      if (data.listConversations.length > 0) {
        setSelected(data.listConversations[0].id);
      } else {
        setSelected(null);
      }
    }
  }, [data, projectId]);

  const handleSend = async () => {
    if (!prompt || !projectId) return;
    await sendMessage({
      variables: {
        topic: 'forgekeeper/task',
        message: { content: prompt },
      },
    });
  };

  const handleStop = async () => {
    await stopMessage();
  };

  const handleAddFolder = () => {
    const name = window.prompt('Folder name');
    if (name) dispatchFolders({ type: 'add', name });
  };

  const handleFolderRename = (oldName: string) => {
    const name = window.prompt('Rename folder', oldName);
    if (name && name !== oldName) {
      dispatchFolders({ type: 'rename', oldName, newName: name });
      dispatchConvs({
        type: 'set',
        payload: conversations.map(c => (c.folder === oldName ? { ...c, folder: name } : c)),
      });
    }
  };

  const handleDropConversation = async (folder: string, id: string) => {
    await moveConversation({ variables: { conversationId: id, folder } });
    dispatchConvs({ type: 'move', id, folder });
    dispatchFolders({ type: 'add', name: folder });
  };

  const openContextMenu = (e: React.MouseEvent<HTMLButtonElement>, conv: Conversation) => {
    setMenuAnchor(e.currentTarget);
    setContextConv(conv);
  };

  const closeContextMenu = () => {
    setMenuAnchor(null);
    setContextConv(null);
  };

  const handleArchive = async () => {
    if (!contextConv) return;
    await archiveConversation({ variables: { conversationId: contextConv.id } });
    dispatchConvs({ type: 'archive', id: contextConv.id });
  };

  const handleDelete = async () => {
    if (!contextConv) return;
    await deleteConversation({ variables: { conversationId: contextConv.id } });
    dispatchConvs({ type: 'delete', id: contextConv.id });
  };

  const handleMove = async () => {
    if (!contextConv) return;
    const folder = window.prompt('Move to folder', contextConv.folder || '');
    if (folder) {
      await moveConversation({ variables: { conversationId: contextConv.id, folder } });
      dispatchConvs({ type: 'move', id: contextConv.id, folder });
      dispatchFolders({ type: 'add', name: folder });
    }
  };

  const selectedConv = conversations.find(c => c.id === selected);
  const isBusy = sending || stopping;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SyncIndicator />
      <Box display="flex" sx={{ height: '100vh', flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box
          width={{ xs: '100%', sm: 300 }}
          borderRight={{ sm: 1 }}
          borderColor="divider"
          display="flex"
          flexDirection="column"
        >
          <Box p={1}>
            <ProjectSelector value={projectId} onChange={setProjectId} />
          </Box>
          <Box display="flex" alignItems="center" justifyContent="space-between" p={1}>
            <Typography variant="h6">Conversations</Typography>
            <Box>
              <IconButton size="small" onClick={() => setDarkMode(!darkMode)}>
                {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
              <IconButton size="small" onClick={handleAddFolder}>
                <AddIcon />
              </IconButton>
            </Box>
          </Box>
          {convLoading ? (
            <Box flexGrow={1} display="flex" alignItems="center" justifyContent="center">
              <CircularProgress />
            </Box>
          ) : (
            <>
              <ConversationList
                conversations={conversations}
                selected={selected}
                onSelect={setSelected}
                onContextMenu={openContextMenu}
              />
              <FolderTree
                folders={folders}
                onRenameFolder={handleFolderRename}
                onDropConversation={handleDropConversation}
              />
            </>
          )}
        </Box>
        <Box flexGrow={1} display="flex" flexDirection="column">
          <ConversationView conversation={selectedConv} busy={isBusy} />
          <LogPanel conversation={selectedConv} />
          <PromptInput
            prompt={prompt}
            onPromptChange={setPrompt}
            onSend={handleSend}
            onStop={handleStop}
            disabled={isBusy}
          />
        </Box>
        <ContextMenu
          anchorEl={menuAnchor}
          onClose={closeContextMenu}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      </Box>
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
