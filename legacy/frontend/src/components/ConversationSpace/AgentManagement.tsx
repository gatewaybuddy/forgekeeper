/**
 * AgentManagement - Modal for managing agents
 *
 * Features:
 * - List all agents with their configuration
 * - Edit agent metadata (name, icon, color, role, threshold)
 * - Edit agent prompts
 * - Edit provider/model configuration
 * - Enable/disable agents
 * - Add/remove agents
 */

import React, { useState, useEffect } from 'react';
import './AgentManagement.css';

interface AgentProvider {
  type: string;
  model: string;
  apiKey: string;
  apiBase: string;
}

interface AgentPrompt {
  file: string;
  version: string;
}

interface Agent {
  id: string;
  name: string;
  icon: string;
  color: string;
  role: string;
  description: string;
  enabled: boolean;
  contribution_threshold: number;
  permission_level?: string;
  domain_keywords: string[];
  guardian_mode?: boolean;
  prompt: AgentPrompt;
  provider: AgentProvider;
  channels: string[];
}

interface PermissionLevel {
  id: string;
  name: string;
  description: string;
  icon: string;
  tool_count: number | string;
}

interface AgentManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AgentManagement({ isOpen, onClose }: AgentManagementProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptContent, setPromptContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [newAgentId, setNewAgentId] = useState('');
  const [permissionLevels, setPermissionLevels] = useState<PermissionLevel[]>([]);

  // Load agents and permission levels on mount
  useEffect(() => {
    if (isOpen) {
      loadAgents();
      loadPermissionLevels();
    }
  }, [isOpen]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/conversation-space/agents');
      const data = await response.json();

      if (data.success) {
        setAgents(data.agents);
      } else {
        setError('Failed to load agents');
      }
    } catch (err) {
      setError(`Error loading agents: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPermissionLevels = async () => {
    try {
      const response = await fetch('/api/conversation-space/permission-levels');
      const data = await response.json();

      if (data.success) {
        setPermissionLevels(data.levels);
      }
    } catch (err) {
      console.error('Error loading permission levels:', err);
    }
  };

  const handleSelectAgent = async (agent: Agent) => {
    setSelectedAgent(agent);
    setEditingPrompt(false);
    setSaveMessage(null);

    // Load prompt content
    try {
      const response = await fetch(`/api/conversation-space/agents/${agent.id}/prompt`);
      const data = await response.json();

      if (data.success) {
        setPromptContent(data.prompt);
      }
    } catch (err) {
      console.error('Error loading prompt:', err);
    }
  };

  const handleUpdateAgent = async (updates: Partial<Agent>) => {
    if (!selectedAgent) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/conversation-space/agents/${selectedAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (data.success) {
        setSelectedAgent(data.agent);
        setSaveMessage(data.message);
        await loadAgents();

        // Hot-reload agents if enabled status changed
        if ('enabled' in updates) {
          try {
            const reloadResponse = await fetch('/api/conversation-space/reload-agents', {
              method: 'POST'
            });
            const reloadData = await reloadResponse.json();
            if (reloadData.success) {
              setSaveMessage(`${data.message} (Agents reloaded: ${reloadData.started.length} started, ${reloadData.stopped.length} stopped)`);
              // Notify other components
              window.dispatchEvent(new Event('agents-reloaded'));
            }
          } catch (err) {
            console.error('Failed to reload agents:', err);
          }
        }
      } else {
        setError(data.error || 'Failed to update agent');
      }
    } catch (err) {
      setError(`Error updating agent: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!selectedAgent) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/conversation-space/agents/${selectedAgent.id}/prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: promptContent })
      });

      const data = await response.json();

      if (data.success) {
        setSaveMessage('Prompt saved successfully');
        setEditingPrompt(false);
      } else {
        setError(data.error || 'Failed to save prompt');
      }
    } catch (err) {
      setError(`Error saving prompt: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (agent: Agent) => {
    await handleUpdateAgent({ enabled: !agent.enabled });
  };

  const handleCreateAgent = async () => {
    if (!newAgentId.trim()) {
      setError('Agent ID is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/conversation-space/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newAgentId,
          name: newAgentId.charAt(0).toUpperCase() + newAgentId.slice(1),
          icon: '🤖',
          color: '#6b7280',
          role: 'Assistant',
          description: 'New agent',
          enabled: true,
          contribution_threshold: 0.65,
          domain_keywords: [],
          prompt: { file: `${newAgentId}.txt`, version: 'v1' },
          provider: {
            type: 'anthropic',
            model: 'claude-3-5-haiku-20241022',
            apiKey: '${ANTHROPIC_API_KEY}',
            apiBase: 'https://api.anthropic.com'
          },
          channels: ['general']
        })
      });

      const data = await response.json();

      if (data.success) {
        setCreatingAgent(false);
        setNewAgentId('');
        await loadAgents();

        // Hot-reload to start the new agent
        try {
          const reloadResponse = await fetch('/api/conversation-space/reload-agents', {
            method: 'POST'
          });
          const reloadData = await reloadResponse.json();
          if (reloadData.success) {
            setSaveMessage(`Agent created and started successfully! (${reloadData.started.length} agents started)`);
            // Notify other components
            window.dispatchEvent(new Event('agents-reloaded'));
          }
        } catch (err) {
          setSaveMessage('Agent created but failed to auto-start. Refresh the page to see it.');
          console.error('Failed to reload agents:', err);
        }
      } else {
        setError(data.error || 'Failed to create agent');
      }
    } catch (err) {
      setError(`Error creating agent: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm(`Delete agent "${agentId}"? This will stop the agent immediately.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/conversation-space/agents/${agentId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        setSelectedAgent(null);
        await loadAgents();

        // Hot-reload to stop the deleted agent
        try {
          const reloadResponse = await fetch('/api/conversation-space/reload-agents', {
            method: 'POST'
          });
          const reloadData = await reloadResponse.json();
          if (reloadData.success) {
            setSaveMessage(`Agent deleted and stopped successfully! (${reloadData.stopped.length} agents stopped)`);
            // Notify other components
            window.dispatchEvent(new Event('agents-reloaded'));
          }
        } catch (err) {
          setSaveMessage('Agent deleted but failed to auto-stop. Refresh the page.');
          console.error('Failed to reload agents:', err);
        }
      } else {
        setError(data.error || 'Failed to delete agent');
      }
    } catch (err) {
      setError(`Error deleting agent: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="agent-management-overlay" onClick={onClose}>
      <div className="agent-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🤖 Agent Management</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {saveMessage && (
          <div className="save-message">{saveMessage}</div>
        )}

        <div className="modal-body">
          {/* Agent List */}
          <div className="agent-list-panel">
            <div className="panel-header">
              <h3>Agents</h3>
              <button
                className="create-agent-button"
                onClick={() => setCreatingAgent(!creatingAgent)}
                title={creatingAgent ? 'Cancel' : 'Create new agent'}
              >
                {creatingAgent ? '✕' : '+'} {creatingAgent ? 'Cancel' : 'New'}
              </button>
            </div>

            {creatingAgent && (
              <div className="create-agent-form">
                <input
                  type="text"
                  placeholder="Agent ID (e.g., oracle)"
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateAgent()}
                />
                <button
                  className="primary"
                  onClick={handleCreateAgent}
                  disabled={loading || !newAgentId.trim()}
                >
                  Create
                </button>
              </div>
            )}

            {loading && agents.length === 0 ? (
              <div className="loading">Loading agents...</div>
            ) : (
              <div className="agent-list">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`agent-item ${selectedAgent?.id === agent.id ? 'selected' : ''} ${!agent.enabled ? 'disabled' : ''}`}
                    onClick={() => handleSelectAgent(agent)}
                  >
                    <div className="agent-item-header">
                      <span className="agent-icon" style={{ color: agent.color }}>
                        {agent.icon}
                      </span>
                      <div className="agent-item-info">
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-role">{agent.role}</div>
                      </div>
                    </div>
                    <div className="agent-item-status">
                      {agent.enabled ? '✓' : '✗'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent Editor */}
          {selectedAgent && (
            <div className="agent-editor-panel">
              <div className="editor-tabs">
                <button
                  className={`tab ${!editingPrompt ? 'active' : ''}`}
                  onClick={() => setEditingPrompt(false)}
                >
                  Configuration
                </button>
                <button
                  className={`tab ${editingPrompt ? 'active' : ''}`}
                  onClick={() => setEditingPrompt(true)}
                >
                  Prompt
                </button>
              </div>

              {!editingPrompt ? (
                <div className="config-editor">
                  <h3>Agent Configuration</h3>

                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={selectedAgent.name}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, name: e.target.value })}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Icon (Emoji)</label>
                      <input
                        type="text"
                        value={selectedAgent.icon}
                        onChange={(e) => setSelectedAgent({ ...selectedAgent, icon: e.target.value })}
                        maxLength={2}
                      />
                    </div>

                    <div className="form-group">
                      <label>Color</label>
                      <input
                        type="color"
                        value={selectedAgent.color}
                        onChange={(e) => setSelectedAgent({ ...selectedAgent, color: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Role</label>
                    <input
                      type="text"
                      value={selectedAgent.role}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, role: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={selectedAgent.description}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="form-group">
                    <label>Contribution Threshold (0.0 - 1.0)</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedAgent.contribution_threshold}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, contribution_threshold: parseFloat(e.target.value) })}
                    />
                    <small>Lower = more likely to contribute</small>
                  </div>

                  <div className="form-group">
                    <label>Tool Permission Level</label>
                    <select
                      value={selectedAgent.permission_level || 'read_only'}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, permission_level: e.target.value })}
                    >
                      {permissionLevels.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.icon} {level.name} - {level.tool_count === 'all' ? 'All tools' : `${level.tool_count} tools`}
                        </option>
                      ))}
                    </select>
                    {selectedAgent.permission_level && permissionLevels.length > 0 && (
                      <small>
                        {permissionLevels.find(l => l.id === (selectedAgent.permission_level || 'read_only'))?.description}
                      </small>
                    )}
                  </div>

                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedAgent.enabled}
                        onChange={(e) => setSelectedAgent({ ...selectedAgent, enabled: e.target.checked })}
                      />
                      {' '}Enabled
                    </label>
                  </div>

                  <div className="section-divider" />

                  <h4>Provider Configuration</h4>

                  <div className="form-group">
                    <label>Provider Type</label>
                    <select
                      value={selectedAgent.provider.type}
                      onChange={(e) => setSelectedAgent({
                        ...selectedAgent,
                        provider: { ...selectedAgent.provider, type: e.target.value }
                      })}
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="local">Local Inference</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Model</label>
                    <select
                      value={selectedAgent.provider.model}
                      onChange={(e) => setSelectedAgent({
                        ...selectedAgent,
                        provider: { ...selectedAgent.provider, model: e.target.value }
                      })}
                    >
                      <optgroup label="OpenAI">
                        <option value="gpt-5.2">GPT-5.2</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="o1">o1</option>
                        <option value="o1-mini">o1 Mini</option>
                      </optgroup>
                      <optgroup label="Anthropic Claude">
                        <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                        <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
                        <option value="claude-3-5-sonnet-20241022">Claude Sonnet 3.5</option>
                        <option value="claude-3-5-haiku-20241022">Claude Haiku 3.5</option>
                        <option value="claude-3-haiku-20240307">Claude Haiku 3</option>
                      </optgroup>
                      <optgroup label="Local/Other">
                        <option value="local">Local Model</option>
                        <option value="custom">Custom</option>
                      </optgroup>
                    </select>
                    {(selectedAgent.provider.model === 'custom' || selectedAgent.provider.model === 'local') && (
                      <input
                        type="text"
                        placeholder="Enter custom model name"
                        value={selectedAgent.provider.model}
                        onChange={(e) => setSelectedAgent({
                          ...selectedAgent,
                          provider: { ...selectedAgent.provider, model: e.target.value }
                        })}
                        style={{ marginTop: '8px' }}
                      />
                    )}
                  </div>

                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={selectedAgent.provider.apiKey}
                      onChange={(e) => setSelectedAgent({
                        ...selectedAgent,
                        provider: { ...selectedAgent.provider, apiKey: e.target.value }
                      })}
                      placeholder="Environment variable reference or actual key"
                    />
                    <small>Tip: Use ${'{'}ENV_VAR:-DEFAULT{'}'} syntax</small>
                  </div>

                  <div className="form-group">
                    <label>API Base URL</label>
                    <input
                      type="text"
                      value={selectedAgent.provider.apiBase}
                      onChange={(e) => setSelectedAgent({
                        ...selectedAgent,
                        provider: { ...selectedAgent.provider, apiBase: e.target.value }
                      })}
                      placeholder="https://api.anthropic.com"
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      className="primary"
                      onClick={() => handleUpdateAgent(selectedAgent)}
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : 'Save Configuration'}
                    </button>
                    <button
                      className="danger"
                      onClick={() => handleDeleteAgent(selectedAgent.id)}
                      disabled={loading}
                    >
                      Delete Agent
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prompt-editor">
                  <h3>System Prompt</h3>
                  <p className="prompt-info">
                    File: <code>{selectedAgent.prompt.file}</code> (v{selectedAgent.prompt.version})
                  </p>

                  <textarea
                    className="prompt-textarea"
                    value={promptContent}
                    onChange={(e) => setPromptContent(e.target.value)}
                    rows={20}
                    spellCheck={false}
                  />

                  <div className="form-actions">
                    <button
                      className="primary"
                      onClick={handleSavePrompt}
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : 'Save Prompt'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
