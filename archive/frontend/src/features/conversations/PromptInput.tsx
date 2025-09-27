import React, { useMemo, useRef } from 'react';
import { Box, Button, TextField, Tooltip, Typography, Paper, List, ListItemButton, ListItemText } from '@mui/material';
import { Conversation } from '../../types';
import { countTokens } from '../../token';

const COMMANDS: Record<string, string> = {
  model: 'Set active model name (e.g., mistral, tiny)',
  temperature: 'Set sampling temperature (0..2)',
  top_p: 'Set nucleus sampling (0..1)',
  backend: 'Select backend: openai | transformers',
  gateway: 'Set OpenAI-compatible base URL',
  project: 'Switch project context (UI selector recommended)',
  context: 'Toggle/show context counter: on|off or <limit>',
  restart: 'Reload UI to apply changes',
  reset: 'Reset settings to defaults',
  help: 'Show command palette',
};

interface PromptInputProps {
  prompt: string;
  onPromptChange: (_value: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
  conversation: Conversation | null;
}

export default function PromptInput({ prompt, onPromptChange, onSend, onStop, disabled, conversation }: PromptInputProps) {
  const inputRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      onSend();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      // Insert newline at caret position
      e.preventDefault();
      const el = e.target as HTMLInputElement;
      const start = el.selectionStart ?? prompt.length;
      const end = el.selectionEnd ?? prompt.length;
      const next = `${prompt.slice(0, start)}\n${prompt.slice(end)}`;
      onPromptChange(next);
      // Move caret after the newline. setTimeout to wait state update
      setTimeout(() => {
        try { el.selectionStart = el.selectionEnd = start + 1; } catch {}
      }, 0);
    }
  };

  const isCommand = prompt.trim().startsWith('/')
  const commandName = isCommand ? prompt.trim().slice(1).split(/\s+/)[0] : '';
  const commandHint = isCommand ? (COMMANDS[commandName] || 'Type /help to see available commands') : '';

  const tokenInfo = useMemo(() => {
    const show = (localStorage.getItem('fk_show_context') ?? 'on') !== 'off';
    if (!show) return null;
    const msgs = conversation?.messages || [];
    const historyText = msgs.map(m => `${m.role}: ${m.content || ''}`).join('\n');
    const total = countTokens(`${historyText}\n${prompt}`);
    const max = Number(localStorage.getItem('fk_context_limit') || '8192');
    const remaining = Math.max(0, max - total);
    return { total, max, remaining };
  }, [conversation, prompt]);

  const matchingCommands = useMemo(() => {
    if (!isCommand) return [] as Array<{key: string, desc: string}>;
    const q = commandName.toLowerCase();
    return Object.entries(COMMANDS)
      .filter(([k]) => k.startsWith(q))
      .slice(0, 6)
      .map(([key, desc]) => ({ key, desc }));
  }, [isCommand, commandName]);

  const applyCommand = (cmd: string) => {
    const rest = prompt.trim().slice(1).split(/\s+/).slice(1).join(' ');
    const next = `/${cmd}${rest ? ' ' + rest : ''}`;
    onPromptChange(next);
  };

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); onSend(); }} p={2} display="flex" gap={1} flexDirection="column">
      {isCommand && (
        <Typography variant="caption" color="text.secondary">
          /{commandName || '…'} — {commandHint}
        </Typography>
      )}
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
        inputRef={inputRef}
      />
      <Box display="flex" gap={1}>
        <Tooltip title="Send (Enter)">
          <span>
            <Button variant="contained" type="submit" disabled={!prompt || disabled}>Send</Button>
          </span>
        </Tooltip>
        <Tooltip title="Stop current message">
          <span>
            <Button variant="outlined" onClick={onStop} disabled={disabled}>Stop</Button>
          </span>
        </Tooltip>
        {tokenInfo && (
          <Box ml="auto" display="flex" alignItems="center">
            <Typography variant="caption" color={tokenInfo.remaining > 0 ? 'text.secondary' : 'error'}>
              Context: {tokenInfo.total}/{tokenInfo.max} (remaining {tokenInfo.remaining})
            </Typography>
          </Box>
        )}
      </Box>
      {isCommand && matchingCommands.length > 0 && (
        <Paper elevation={2} sx={{ mt: 1, maxWidth: 560 }}>
          <List dense>
            {matchingCommands.map(item => (
              <ListItemButton key={item.key} onClick={() => applyCommand(item.key)}>
                <ListItemText primary={`/${item.key}`} secondary={item.desc} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
