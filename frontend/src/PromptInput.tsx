import React from 'react';
import { Box, Button, TextField, Tooltip } from '@mui/material';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (_value: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
}

export default function PromptInput({ prompt, onPromptChange, onSend, onStop, disabled }: PromptInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); onSend(); }} p={2} display="flex" gap={1}>
      <TextField
        label="Prompt"
        multiline
        minRows={2}
        maxRows={6}
        fullWidth
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <Tooltip title="Send (⌘+Enter)">
        <span>
          <Button variant="contained" type="submit" disabled={!prompt || disabled}>Send</Button>
        </span>
      </Tooltip>
      <Tooltip title="Stop current message">
        <span>
          <Button variant="outlined" onClick={onStop} disabled={disabled}>Stop</Button>
        </span>
      </Tooltip>
    </Box>
  );
}
