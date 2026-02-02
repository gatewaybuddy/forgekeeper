/**
 * ConversationSpace - Main container for multi-agent conversation
 *
 * Layout:
 * - Left sidebar: ConversationList
 * - Right sidebar: AgentPresenceBar (toggleable)
 * - Center: MessageFeed
 * - Bottom: MessageComposer
 */

import React, { useState, useEffect } from 'react';
import { MessageFeed } from './MessageFeed';
import { MessageComposer } from './MessageComposer';
import { AgentPresenceBar } from './AgentPresenceBar';
import { AgentManagement } from './AgentManagement';
import { ConversationList } from './ConversationList';
import { ProjectManagement } from './ProjectManagement';
import './ConversationSpace.css';

interface Conversation {
  id: string;
  title: string;
  project_id: string | null;
  channel_id: string;
  status: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

export function ConversationSpace() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showConversationList, setShowConversationList] = useState(true);
  const [showAgentSidebar, setShowAgentSidebar] = useState(true);
  const [showAgentManagement, setShowAgentManagement] = useState(false);
  const [showProjectManagement, setShowProjectManagement] = useState(false);
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // New conversation form
  const [newConvTitle, setNewConvTitle] = useState('');
  const [newConvProjectId, setNewConvProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // Load or create initial conversation
  useEffect(() => {
    loadInitialConversation();
  }, []);

  // Load projects for conversation creation
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/conversation-space/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  const loadInitialConversation = async () => {
    try {
      // Try to load active conversations
      const res = await fetch('/api/conversation-space/conversations?status=active&limit=1');
      const data = await res.json();

      if (data.success && data.conversations.length > 0) {
        // Load the most recent conversation
        setActiveConversation(data.conversations[0]);
      } else {
        // No conversations exist, create one (skip dialog for auto-creation)
        await createNewConversation('New Conversation', null, true);
      }
    } catch (err) {
      console.error('Error loading initial conversation:', err);
    }
  };

  const openNewConversationDialog = () => {
    setNewConvTitle(`Conversation ${new Date().toLocaleString()}`);
    setNewConvProjectId(null);
    setShowNewConversationDialog(true);
  };

  const createNewConversation = async (title?: string, projectId?: string | null, skipDialog?: boolean) => {
    // If called without parameters and not skipping dialog, show the dialog
    if (!skipDialog && !title) {
      openNewConversationDialog();
      return;
    }

    try {
      const res = await fetch('/api/conversation-space/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || `Conversation ${new Date().toLocaleString()}`,
          project_id: projectId !== undefined ? projectId : null
        })
      });

      const data = await res.json();

      if (data.success) {
        setActiveConversation(data.conversation);
        setRefreshKey(k => k + 1);
        setShowNewConversationDialog(false);
      }
    } catch (err) {
      console.error('Error creating conversation:', err);
    }
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    await createNewConversation(newConvTitle, newConvProjectId, true);
  };

  const handleConversationSelect = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversation-space/conversations/${conversationId}`);
      const data = await res.json();

      if (data.success) {
        setActiveConversation(data.conversation);
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  const handleArchiveConversation = async () => {
    if (!activeConversation) return;

    if (!confirm(`Archive "${activeConversation.title}"? You can view archived conversations later.`)) {
      return;
    }

    try {
      setArchiving(true);

      const res = await fetch(`/api/conversation-space/conversations/${activeConversation.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (data.success) {
        // Create a new conversation after archiving
        await createNewConversation();
      } else {
        alert(`Error: ${data.error || 'Failed to archive conversation'}`);
      }
    } catch (err) {
      alert(`Error archiving conversation: ${err}`);
    } finally {
      setArchiving(false);
    }
  };

  const handleUpdateTitle = async (newTitle: string) => {
    if (!activeConversation || !newTitle.trim()) return;

    try {
      const res = await fetch(`/api/conversation-space/conversations/${activeConversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });

      const data = await res.json();

      if (data.success) {
        setActiveConversation(data.conversation);
      }
    } catch (err) {
      console.error('Error updating title:', err);
    }
  };

  const handleMessageSent = (messageId: string) => {
    console.log('[ConversationSpace] Message sent:', messageId);
    // Trigger conversation list refresh to update message count
    setRefreshKey(k => k + 1);
  };

  if (!activeConversation) {
    return (
      <div className="conversation-space">
        <div className="conversation-loading">
          <p>Loading conversation space...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation-space">
      <header className="conversation-header">
        <div className="header-left">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setShowConversationList(!showConversationList)}
            title={showConversationList ? 'Hide conversations' : 'Show conversations'}
          >
            {showConversationList ? '◀' : '▶'}
          </button>
          <input
            type="text"
            className="conversation-title-input"
            value={activeConversation.title}
            onChange={(e) => setActiveConversation({ ...activeConversation, title: e.target.value })}
            onBlur={(e) => handleUpdateTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
          />
          <span className="conversation-status">
            {activeConversation.status === 'archived' && '📦 Archived'}
          </span>
        </div>

        <div className="header-right">
          <button
            className="archive-button"
            onClick={handleArchiveConversation}
            disabled={archiving || activeConversation.status === 'archived'}
            title="Archive conversation"
          >
            {archiving ? '⏳' : '📦'} Archive
          </button>

          <button
            className="projects-button"
            onClick={() => setShowProjectManagement(true)}
            title="Manage projects"
          >
            📁 Projects
          </button>

          <button
            className="settings-button"
            onClick={() => setShowAgentManagement(true)}
            title="Agent settings"
          >
            ⚙️ Settings
          </button>
          <button
            className="sidebar-toggle"
            onClick={() => setShowAgentSidebar(!showAgentSidebar)}
            title={showAgentSidebar ? 'Hide agents' : 'Show agents'}
          >
            {showAgentSidebar ? '▶' : '◀'} Agents
          </button>
        </div>
      </header>

      <div className="conversation-body">
        {showConversationList && (
          <aside className="conversation-list-sidebar">
            <ConversationList
              activeConversationId={activeConversation.id}
              onConversationSelect={handleConversationSelect}
              onNewConversation={() => createNewConversation()}
            />
          </aside>
        )}

        <main className="conversation-main">
          <MessageFeed
            key={`${activeConversation.id}-${refreshKey}`}
            channelId={activeConversation.channel_id}
            conversationId={activeConversation.id}
          />
          <MessageComposer
            channelId={activeConversation.channel_id}
            conversationId={activeConversation.id}
            onMessageSent={handleMessageSent}
          />
        </main>

        {showAgentSidebar && (
          <aside className="conversation-sidebar">
            <AgentPresenceBar channelId={activeConversation.channel_id} />
          </aside>
        )}
      </div>

      <AgentManagement
        isOpen={showAgentManagement}
        onClose={() => setShowAgentManagement(false)}
      />

      <ProjectManagement
        isOpen={showProjectManagement}
        onClose={() => setShowProjectManagement(false)}
        onProjectCreated={() => {
          setRefreshKey(k => k + 1);
          loadProjects();
        }}
      />

      {/* New Conversation Dialog */}
      {showNewConversationDialog && (
        <div className="project-management-overlay" onClick={() => setShowNewConversationDialog(false)}>
          <div className="project-management-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Create New Conversation</h2>
              <button className="close-btn" onClick={() => setShowNewConversationDialog(false)}>×</button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleCreateConversation} className="project-form">
                <div className="form-group">
                  <label>Conversation Title *</label>
                  <input
                    type="text"
                    value={newConvTitle}
                    onChange={(e) => setNewConvTitle(e.target.value)}
                    placeholder="e.g., Planning Session, Bug Investigation"
                    required
                    maxLength={100}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Project</label>
                  <select
                    value={newConvProjectId || ''}
                    onChange={(e) => setNewConvProjectId(e.target.value || null)}
                    className="model-dropdown"
                  >
                    <option value="">No Project</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setShowNewConversationDialog(false)}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="create-btn">
                    Create Conversation
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
