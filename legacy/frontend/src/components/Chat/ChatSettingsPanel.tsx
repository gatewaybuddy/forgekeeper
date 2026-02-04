import React from 'react';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface ChatSettingsPanelProps {
  // Model settings
  model: string;
  onModelChange: (model: string) => void;

  // Generation settings
  maxTokens: number;
  onMaxTokensChange: (tokens: number) => void;
  temperature: number;
  onTemperatureChange: (temp: number) => void;
  topP: number;
  onTopPChange: (topP: number) => void;

  // Review/Chunked mode
  reviewEnabled: boolean;
  onReviewEnabledChange: (enabled: boolean) => void;
  chunkedEnabled: boolean;
  onChunkedEnabledChange: (enabled: boolean) => void;

  // API settings
  apiBase: string;
  onApiBaseChange: (base: string) => void;

  // Optional: Advanced settings
  showAdvanced?: boolean;
}

/**
 * ChatSettingsPanel - Collapsible settings panel for chat configuration
 *
 * Consolidates all chat settings into a single, clean interface matching
 * the test-thought-world.html design pattern.
 */
export function ChatSettingsPanel({
  model,
  onModelChange,
  maxTokens,
  onMaxTokensChange,
  temperature,
  onTemperatureChange,
  topP,
  onTopPChange,
  reviewEnabled,
  onReviewEnabledChange,
  chunkedEnabled,
  onChunkedEnabledChange,
  apiBase,
  onApiBaseChange,
  showAdvanced = false,
}: ChatSettingsPanelProps) {
  return (
    <details className="settings-panel">
      <summary>⚙️ Configuration</summary>

      <div className="settings-grid">
        {/* Basic Settings */}
        <div className="setting-row">
          <label className="setting-label">Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="core"
          />
        </div>

        <div className="setting-row">
          <label className="setting-label">Max Tokens</label>
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => onMaxTokensChange(Number(e.target.value))}
            min={256}
            max={8192}
          />
        </div>

        <div className="setting-row">
          <label className="setting-label">Temperature</label>
          <input
            type="number"
            value={temperature}
            onChange={(e) => onTemperatureChange(Number(e.target.value))}
            min={0}
            max={2}
            step={0.1}
          />
        </div>

        <div className="setting-row">
          <label className="setting-label">Top P</label>
          <input
            type="number"
            value={topP}
            onChange={(e) => onTopPChange(Number(e.target.value))}
            min={0}
            max={1}
            step={0.1}
          />
        </div>

        {/* Mode Toggles */}
        <div className="setting-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
            <input
              type="checkbox"
              checked={reviewEnabled}
              onChange={(e) => onReviewEnabledChange(e.target.checked)}
            />
            <span className="setting-label" style={{ marginBottom: 0 }}>
              Review Mode
            </span>
          </label>
          <span className="text-xs text-tertiary">
            Iteratively improve responses with self-evaluation
          </span>
        </div>

        <div className="setting-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
            <input
              type="checkbox"
              checked={chunkedEnabled}
              onChange={(e) => onChunkedEnabledChange(e.target.checked)}
            />
            <span className="setting-label" style={{ marginBottom: 0 }}>
              Chunked Mode
            </span>
          </label>
          <span className="text-xs text-tertiary">
            Break complex responses into multiple chunks
          </span>
        </div>

        {/* Advanced Settings */}
        {showAdvanced && (
          <details className="advanced-settings">
            <summary>Advanced Settings</summary>
            <div className="settings-grid" style={{ marginTop: 'var(--gap-md)' }}>
              <div className="setting-row">
                <label className="setting-label">API Base URL</label>
                <input
                  type="text"
                  value={apiBase}
                  onChange={(e) => onApiBaseChange(e.target.value)}
                  placeholder="/v1"
                />
                <span className="text-xs text-tertiary">
                  Backend API endpoint (use /v1 for proxy)
                </span>
              </div>
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
