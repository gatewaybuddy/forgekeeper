import React from 'react';
import { Box, Typography } from '@mui/material';
import { Conversation } from './types';

interface LogPanelProps {
  conversation?: Conversation;
}

export default function LogPanel({ conversation }: LogPanelProps) {
  const logs = conversation?.messages.filter(m => m.role === 'self-review' || m.role === 'commit-check') || [];
  if (logs.length === 0) return null;
  return (
    <Box p={1} borderTop={1} borderColor="divider" maxHeight={150} overflow="auto" bgcolor="background.default">
      {logs.slice(-10).map(msg => (
        <Typography key={msg.id} variant="body2">
          {msg.content}
        </Typography>
      ))}
    </Box>
  );
}
