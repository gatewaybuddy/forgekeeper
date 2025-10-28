/**
 * Auto Mode Button Component
 *
 * Simple button to trigger autonomous agent mode
 */

import React, { useState } from 'react';

interface AutoModeButtonProps {
  onStart: (task: string) => void;
  disabled?: boolean;
}

export function AutoModeButton({ onStart, disabled }: AutoModeButtonProps) {
  const [showInput, setShowInput] = useState(false);
  const [task, setTask] = useState('');

  const handleStart = () => {
    if (task.trim()) {
      onStart(task.trim());
      setTask('');
      setShowInput(false);
    }
  };

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        disabled={disabled}
        style={{
          background: '#059669',
          color: 'white',
          padding: '8px 16px',
          borderRadius: 6,
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        🤖 Auto Mode
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="text"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleStart();
          if (e.key === 'Escape') setShowInput(false);
        }}
        placeholder="Enter autonomous task..."
        autoFocus
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #d1d5db',
          minWidth: '300px',
        }}
      />
      <button
        onClick={handleStart}
        disabled={!task.trim()}
        style={{
          background: '#059669',
          color: 'white',
          padding: '8px 16px',
          borderRadius: 6,
          border: 'none',
          cursor: !task.trim() ? 'not-allowed' : 'pointer',
          opacity: !task.trim() ? 0.6 : 1,
        }}
      >
        Start
      </button>
      <button
        onClick={() => setShowInput(false)}
        style={{
          background: '#6b7280',
          color: 'white',
          padding: '8px 16px',
          borderRadius: 6,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

interface AutoModeProgressProps {
  iteration: number;
  maxIterations: number;
  progress: number;
  onStop: () => void;
}

export function AutoModeProgress({ iteration, maxIterations, progress, onStop }: AutoModeProgressProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: '#ecfdf5',
        border: '1px solid #10b981',
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      <div className="spinner" style={{
        width: 16,
        height: 16,
        border: '2px solid #10b981',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#047857', marginBottom: 4 }}>
          🤖 Auto Mode Running...
        </div>
        <div style={{ fontSize: 12, color: '#059669' }}>
          Iteration {iteration}/{maxIterations} • {progress}% complete
        </div>
      </div>

      <button
        onClick={onStop}
        style={{
          background: '#dc2626',
          color: 'white',
          padding: '6px 12px',
          borderRadius: 6,
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        ⏹ Stop
      </button>
    </div>
  );
}

// CSS animation for spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
