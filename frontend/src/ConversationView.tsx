import React, { useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { Conversation } from './types';

interface ConversationViewProps {
  conversation?: Conversation;
  busy: boolean;
}

export default function ConversationView({ conversation, busy }: ConversationViewProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  return (
    <Box flexGrow={1} p={2} overflow="auto">
      {conversation?.messages.map(msg => (
        <Box key={msg.id} mb={1} textAlign={msg.role === 'user' ? 'right' : 'left'}>
          <Typography variant="body2" color="textSecondary">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </Typography>
          <Box
            component="div"
            sx={{
              display: 'inline-block',
              bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.300',
              color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
              p: 1,
              borderRadius: 1,
              maxWidth: '80%'
            }}
          >
            {msg.content}
          </Box>
        </Box>
      ))}
      {busy && (
        <Box display="flex" justifyContent="center" mt={2}>
          <CircularProgress size={24} />
        </Box>
      )}
      <div ref={endRef} />
    </Box>
  );
}
