import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderTree from './FolderTree';
import useFolders from './useFolders';
import { Conversation } from './types';

interface FolderManagerProps {
  conversations: Conversation[];
  moveConversation: (_id: string, _folder: string) => Promise<void>;
  renameConversationFolder: (_oldName: string, _newName: string) => void;
}

export default function FolderManager({
  conversations,
  moveConversation,
  renameConversationFolder,
}: FolderManagerProps) {
  const { folders, addFolder, renameFolder } = useFolders(conversations);

  const handleAddFolder = () => {
    const name = window.prompt('Folder name');
    if (name) addFolder(name);
  };

  const handleRenameFolder = (oldName: string) => {
    const name = window.prompt('Rename folder', oldName);
    if (name && name !== oldName) {
      renameFolder(oldName, name);
      renameConversationFolder(oldName, name);
    }
  };

  const handleDropConversation = async (folder: string, id: string) => {
    await moveConversation(id, folder);
    addFolder(folder);
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" p={1}>
        <Typography variant="h6">Folders</Typography>
        <IconButton size="small" onClick={handleAddFolder}>
          <AddIcon />
        </IconButton>
      </Box>
      <FolderTree
        folders={folders}
        onRenameFolder={handleRenameFolder}
        onDropConversation={handleDropConversation}
      />
    </Box>
  );
}
