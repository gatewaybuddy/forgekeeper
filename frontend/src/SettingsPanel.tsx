import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Switch, FormControlLabel, Stack
} from '@mui/material';
import { useMutation, useQuery } from '@apollo/client';
import { GET_RUNTIME_CONFIG, SET_RUNTIME_CONFIG, REQUEST_RESTART } from './graphql';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { data } = useQuery(GET_RUNTIME_CONFIG, { fetchPolicy: 'network-only', skip: !open });
  const [saveConfig] = useMutation(SET_RUNTIME_CONFIG);
  const [requestRestart] = useMutation(REQUEST_RESTART);

  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('0.7');
  const [topP, setTopP] = useState('1.0');
  const [gateway, setGateway] = useState('');
  const [showContext, setShowContext] = useState(true);
  const [contextLimit, setContextLimit] = useState('8192');

  useEffect(() => {
    const cfg = (data && data.getRuntimeConfig) || {};
    if (cfg) {
      if (cfg.model) setModel(String(cfg.model));
      if (cfg.temperature !== undefined) setTemperature(String(cfg.temperature));
      if (cfg.top_p !== undefined) setTopP(String(cfg.top_p));
      if (cfg.gateway) setGateway(String(cfg.gateway));
      if (cfg.show_context !== undefined) setShowContext(String(cfg.show_context) !== 'off');
      if (cfg.context_limit !== undefined) setContextLimit(String(cfg.context_limit));
    }
  }, [data, open]);

  const persist = async () => {
    const patch: any = {
      model: model || null,
      temperature: Number(temperature),
      top_p: Number(topP),
      gateway: gateway || null,
      show_context: showContext ? 'on' : 'off',
      context_limit: Number(contextLimit),
    };
    try {
      await saveConfig({ variables: { patch } });
      // mirror in local storage for immediate UX
      if (model) localStorage.setItem('fk_model', model); else localStorage.removeItem('fk_model');
      localStorage.setItem('fk_temperature', temperature);
      localStorage.setItem('fk_top_p', topP);
      if (gateway) localStorage.setItem('fk_gateway', gateway); else localStorage.removeItem('fk_gateway');
      localStorage.setItem('fk_show_context', showContext ? 'on' : 'off');
      localStorage.setItem('fk_context_limit', contextLimit);
    } catch (e) {
      // best-effort
    }
  };

  const handleSave = async () => {
    await persist();
    onClose();
  };

  const handleApplyAndRestart = async () => {
    await persist();
    try { await requestRestart(); } catch {}
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Stack gap={2} mt={1}>
          <TextField label="Model" value={model} onChange={e => setModel(e.target.value)} fullWidth />
          <Stack direction="row" gap={2}>
            <TextField label="Temperature" type="number" inputProps={{ step: '0.1' }} value={temperature} onChange={e => setTemperature(e.target.value)} fullWidth />
            <TextField label="top_p" type="number" inputProps={{ step: '0.05' }} value={topP} onChange={e => setTopP(e.target.value)} fullWidth />
          </Stack>
          <TextField label="Gateway URL" value={gateway} onChange={e => setGateway(e.target.value)} fullWidth />
          <Stack direction="row" gap={2} alignItems="center">
            <FormControlLabel
              control={<Switch checked={showContext} onChange={e => setShowContext(e.target.checked)} />}
              label="Show context counter"
            />
            <TextField label="Context limit" type="number" value={contextLimit} onChange={e => setContextLimit(e.target.value)} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
        <Button variant="contained" color="primary" onClick={handleApplyAndRestart}>Apply & Restart</Button>
      </DialogActions>
    </Dialog>
  );
}
