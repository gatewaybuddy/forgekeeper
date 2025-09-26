import React from 'react';
import { Menu, MenuItem } from '@mui/material';

interface ContextMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMove: () => void;
}

export default function ContextMenu({ anchorEl, onClose, onArchive, onDelete, onMove }: ContextMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem onClick={() => { onArchive(); onClose(); }}>Archive</MenuItem>
      <MenuItem onClick={() => { onDelete(); onClose(); }}>Delete</MenuItem>
      <MenuItem onClick={() => { onMove(); onClose(); }}>Move to Folder</MenuItem>
    </Menu>
  );
}
