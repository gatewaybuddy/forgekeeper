import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, CircularProgress, CssBaseline } from '@mui/material';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Conversation } from './types';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';
import PromptInput from './PromptInput';
import FolderManager from './FolderManager';
import ContextMenu from './ContextMenu';
import SyncIndicator from './SyncIndicator';
import LogPanel from './LogPanel';
import { setErrorHandler } from './toast';
import ProjectSelector from './ProjectSelector';
import { projectIdVar } from './apolloClient';
import { useConversations } from './useConversations';

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const {
    conversations,
    selected,
    setSelected,
    selectedConv,
    loading: convLoading,
    send,
    stop,
    moveConversation,
    deleteConversation,
    archiveConversation,
    renameFolder,
    sending,
    stopping,
  } = useConversations(projectId);
  const [prompt, setPrompt] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [contextConv, setContextConv] = useState<Conversation | null>(null);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState(prefersDark);
  const [error, setError] = useState<string | null>(null);

  const theme = createTheme({ palette: { mode: darkMode ? 'dark' : 'light' } });

  useEffect(() => {
    setErrorHandler(msg => setError(msg));
  }, []);

  useEffect(() => {
    projectIdVar(projectId);
  }, [projectId]);

  const handleSend = async () => {
    if (!prompt) return;
    await send(prompt);
    setPrompt('');
  };

  const handleStop = async () => {
    await stop();
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
    await archiveConversation(contextConv.id);
  };

  const handleDelete = async () => {
    if (!contextConv) return;
    await deleteConversation(contextConv.id);
  };

  const handleMove = async () => {
    if (!contextConv) return;
    const folder = window.prompt('Move to folder', contextConv.folder || '');
    if (folder) {
      await moveConversation(contextConv.id, folder);
    }
  };

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
            <IconButton size="small" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
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
              <FolderManager
                conversations={conversations}
                moveConversation={moveConversation}
                renameConversationFolder={renameFolder}
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
            conversation={selectedConv}
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
