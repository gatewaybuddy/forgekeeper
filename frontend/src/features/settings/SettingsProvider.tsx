import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { CssBaseline } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import SettingsPanel from './SettingsPanel';

type SettingsContextValue = {
  darkMode: boolean;
  toggleDarkMode: () => void;
  openSettings: () => void;
  closeSettings: () => void;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState(prefersDark);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const theme = useMemo(() => createTheme({ palette: { mode: darkMode ? 'dark' : 'light' } }), [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(
    () => ({ darkMode, toggleDarkMode, openSettings, closeSettings }),
    [darkMode, toggleDarkMode, openSettings, closeSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
        <SettingsPanel open={settingsOpen} onClose={closeSettings} />
      </ThemeProvider>
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
