import React from 'react';
import { List, ListItem, ListItemButton, ListItemText, IconButton } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Conversation } from '../../types';

interface ConversationListProps {
  conversations: Conversation[];
  selected: string | null;
  onSelect: (_id: string) => void;
  onContextMenu: (_e: React.MouseEvent<HTMLButtonElement>, _conv: Conversation) => void;
}

export default function ConversationList({ conversations, selected, onSelect, onContextMenu }: ConversationListProps) {
  return (
    <List dense sx={{ flexGrow: 1, overflow: 'auto' }}>
      {conversations.map(conv => (
        <ListItem
          key={conv.id}
          disablePadding
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/plain', conv.id)}
        >
          <ListItemButton selected={selected === conv.id} onClick={() => onSelect(conv.id)}>
            <ListItemText primary={conv.title} />
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onContextMenu(e, conv); }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}
