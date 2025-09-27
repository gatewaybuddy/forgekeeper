import React from 'react';
import { TreeView, TreeItem } from '@mui/lab';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box } from '@mui/material';

interface FolderTreeProps {
  folders: string[];
  onRenameFolder: (_folder: string) => void;
  onDropConversation: (_folder: string, _id: string) => void;
}

export default function FolderTree({ folders, onRenameFolder, onDropConversation }: FolderTreeProps) {
  return (
    <Box>
      <TreeView
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        sx={{ flexGrow: 0, overflow: 'auto', p: 1 }}
      >
        {folders.map(folder => (
          <TreeItem
            key={folder}
            nodeId={folder}
            label={folder}
            onDoubleClick={() => onRenameFolder(folder)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              onDropConversation(folder, id);
            }}
          />
        ))}
      </TreeView>
    </Box>
  );
}
