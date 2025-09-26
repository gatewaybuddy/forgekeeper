import React, { useCallback, useEffect, useState } from 'react';
import { Box, Typography, IconButton, CircularProgress, Snackbar } from '@mui/material';
import Alert from '@mui/material/Alert';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SettingsIcon from '@mui/icons-material/Settings';
import { Conversation } from '../../types';
import { setErrorHandler } from '../../toast';
import { ProjectSelector, useProject } from '../projects';
import { useSettings } from '../settings';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';
import PromptInput from './PromptInput';
import FolderManager from './FolderManager';
import ContextMenu from './ContextMenu';
import LogPanel from './LogPanel';
import { useConversations } from './useConversations';

export default function ConversationsPane() {
  const { projectId, setProjectId } = useProject();
  const { darkMode, toggleDarkMode, openSettings } = useSettings();
  const {
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
  } = useConversations(projectId);

  const [prompt, setPrompt] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [contextConv, setContextConv] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setErrorHandler(msg => setError(msg));
    return () => {
      setErrorHandler(() => {});
    };
  }, []);

  const handleProjectChange = useCallback(
    (id: string) => {
      setProjectId(id);
    },
    [setProjectId],
  );

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
    <>
      <Box display="flex" sx={{ height: '100vh', flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box
          width={{ xs: '100%', sm: 300 }}
          borderRight={{ sm: 1 }}
          borderColor="divider"
          display="flex"
          flexDirection="column"
        >
          <Box p={1}>
            <ProjectSelector value={projectId} onChange={handleProjectChange} />
          </Box>
          <Box display="flex" alignItems="center" justifyContent="space-between" p={1}>
            <Typography variant="h6">Conversations</Typography>
            <Box>
              <IconButton size="small" onClick={openSettings} aria-label="settings">
                <SettingsIcon />
              </IconButton>
              <IconButton size="small" onClick={toggleDarkMode} aria-label="toggle theme">
                {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
            </Box>
          </Box>
          {loading ? (
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
          <ConversationView conversation={selectedConv || undefined} busy={isBusy} />
          <LogPanel conversation={selectedConv || undefined} />
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
    </>
  );
}
