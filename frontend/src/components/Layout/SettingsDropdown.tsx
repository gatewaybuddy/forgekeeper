import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * SettingsDropdown - Collapsible dropdown for global settings
 *
 * Replaces the cluttered header controls with a clean dropdown menu.
 * Only shows essential actions - detailed settings moved to chat panel.
 */
export function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleThoughtWorld = () => {
    navigate('/thought-world');
    setIsOpen(false);
  };

  const handleMainChat = () => {
    navigate('/');
    setIsOpen(false);
  };

  const handlePreferences = () => {
    // TODO: Open preferences modal
    console.log('[SettingsDropdown] Open preferences modal');
    setIsOpen(false);
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
      }}
    >
      {/* Settings button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="secondary"
        title="Settings"
        style={{
          padding: 'var(--padding-sm) var(--padding-md)',
        }}
      >
        ⚙️ Settings {isOpen ? '▲' : '▼'}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--padding-sm)',
            minWidth: '200px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 'var(--z-dropdown)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--gap-xs)',
          }}
        >
          <button
            onClick={handleMainChat}
            className="secondary"
            style={{
              width: '100%',
              textAlign: 'left',
              justifyContent: 'flex-start',
              padding: 'var(--padding-sm) var(--padding-md)',
            }}
          >
            💬 Main Chat
          </button>

          <button
            onClick={handleThoughtWorld}
            className="secondary"
            style={{
              width: '100%',
              textAlign: 'left',
              justifyContent: 'flex-start',
              padding: 'var(--padding-sm) var(--padding-md)',
            }}
          >
            🔭 Thought World
          </button>

          <div
            style={{
              height: '1px',
              background: 'var(--border-secondary)',
              margin: 'var(--gap-xs) 0',
            }}
          />

          <button
            onClick={handlePreferences}
            className="secondary"
            style={{
              width: '100%',
              textAlign: 'left',
              justifyContent: 'flex-start',
              padding: 'var(--padding-sm) var(--padding-md)',
            }}
          >
            👤 Preferences
          </button>
        </div>
      )}
    </div>
  );
}
