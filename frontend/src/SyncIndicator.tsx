import React from 'react';
import { LinearProgress } from '@mui/material';
import { useReactiveVar } from '@apollo/client';
import { pendingRequestsVar } from './apolloClient';

export default function SyncIndicator() {
  const pending = useReactiveVar(pendingRequestsVar);
  return pending > 0 ? <LinearProgress /> : null;
}
