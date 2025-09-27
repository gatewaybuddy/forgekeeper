import React from 'react';
import SyncIndicator from './SyncIndicator';
import { SettingsProvider } from './features/settings';
import { ProjectProvider } from './features/projects';
import { ConversationsPane } from './features/conversations';

export default function App() {
  return (
    <SettingsProvider>
      <ProjectProvider>
        <SyncIndicator />
        <ConversationsPane />
      </ProjectProvider>
    </SettingsProvider>
  );
}
