import React, { ReactNode, useState } from 'react';
import { StatusIndicator } from './StatusIndicator';
import { SettingsDropdown } from './SettingsDropdown';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface MainLayoutProps {
  children: ReactNode;
  showThoughtWorldSidebar?: boolean;
  thoughtWorldSidebar?: ReactNode;
  onToggleSidebar?: () => void;
}

/**
 * MainLayout - Unified layout for Forgekeeper application
 *
 * Provides:
 * - Fixed header with status indicators
 * - Main content area with proper scrolling
 * - Optional thought-world sidebar (toggleable)
 * - Responsive design
 */
export function MainLayout({
  children,
  showThoughtWorldSidebar = false,
  thoughtWorldSidebar = null,
  onToggleSidebar,
}: MainLayoutProps) {
  return (
    <div className="main-layout">
      {/* Header with minimal controls */}
      <header className="app-header">
        <h1>Forgekeeper</h1>

        {/* Real-time status indicator */}
        <StatusIndicator />

        {/* Right-side actions */}
        <div className="header-actions">
          {/* Toggle thought-world sidebar */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="secondary"
              title={showThoughtWorldSidebar ? 'Hide agent flow' : 'Show agent flow'}
            >
              {showThoughtWorldSidebar ? '📊 Hide Agents' : '🔭 Show Agents'}
            </button>
          )}

          {/* Settings dropdown */}
          <SettingsDropdown />
        </div>
      </header>

      {/* Content wrapper: main + optional sidebar */}
      <div className="content-wrapper">
        {/* Main content area */}
        <main className="main-content">
          {children}
        </main>

        {/* Thought-world sidebar (conditionally rendered) */}
        {showThoughtWorldSidebar && thoughtWorldSidebar && (
          <aside className={`thought-world-sidebar ${showThoughtWorldSidebar ? 'visible' : ''}`}>
            {thoughtWorldSidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
