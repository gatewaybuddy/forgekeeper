/**
 * ConversationList - Sidebar showing all conversations grouped by project
 *
 * Features:
 * - List active conversations
 * - Group by project
 * - Create new conversation
 * - Search conversations
 * - Switch between conversations
 */

import React, { useState, useEffect } from 'react';
import './ConversationList.css';

interface Conversation {
  id: string;
  title: string;
  project_id: string | null;
  channel_id: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'archived';
  message_count: number;
  last_message_preview: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

interface ConversationListProps {
  activeConversationId?: string;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}

export function ConversationList({
  activeConversationId,
  onConversationSelect,
  onNewConversation
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Load conversations and projects
  useEffect(() => {
    loadData();
  }, [showArchived]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load conversations
      const status = showArchived ? 'archived' : 'active';
      const convRes = await fetch(`/api/conversation-space/conversations?status=${status}`);
      const convData = await convRes.json();

      if (convData.success) {
        setConversations(convData.conversations);
      }

      // Load projects
      const projRes = await fetch('/api/conversation-space/projects');
      const projData = await projRes.json();

      if (projData.success) {
        setProjects(projData.projects);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group conversations by project
  const groupedConversations = () => {
    const filtered = conversations.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groups: { [key: string]: Conversation[] } = {
      'no-project': []
    };

    projects.forEach(p => {
      groups[p.id] = [];
    });

    filtered.forEach(c => {
      const key = c.project_id || 'no-project';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(c);
    });

    return groups;
  };

  const grouped = groupedConversations();

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <h2>Conversations</h2>
        <button
          className="new-conversation-btn"
          onClick={onNewConversation}
          title="New conversation"
        >
          + New
        </button>
      </div>

      <div className="conversation-search">
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="conversation-filter">
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Show archived</span>
        </label>
      </div>

      {loading ? (
        <div className="conversation-list-loading">Loading...</div>
      ) : (
        <div className="conversation-groups">
          {/* No Project group */}
          {grouped['no-project']?.length > 0 && (
            <div className="conversation-group">
              <div className="group-header">
                <span className="group-name">No Project</span>
                <span className="group-count">{grouped['no-project'].length}</span>
              </div>
              <div className="group-conversations">
                {grouped['no-project'].map(conv => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeConversationId}
                    onClick={() => onConversationSelect(conv.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Project groups */}
          {projects.map(project => {
            const projectConvs = grouped[project.id] || [];
            if (projectConvs.length === 0) return null;

            return (
              <div key={project.id} className="conversation-group">
                <div className="group-header">
                  <span
                    className="project-indicator"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="group-name">{project.name}</span>
                  <span className="group-count">{projectConvs.length}</span>
                </div>
                <div className="group-conversations">
                  {projectConvs.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === activeConversationId}
                      onClick={() => onConversationSelect(conv.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {conversations.length === 0 && (
            <div className="empty-state">
              <p>No conversations yet</p>
              <button onClick={onNewConversation} className="create-first-btn">
                Create your first conversation
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div
      className={`conversation-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="conversation-item-header">
        <span className="conversation-title">{conversation.title}</span>
        {conversation.message_count > 0 && (
          <span className="message-count">{conversation.message_count}</span>
        )}
      </div>
      <div className="conversation-item-meta">
        <span className="conversation-date">{formatDate(conversation.updated_at)}</span>
      </div>
      {conversation.last_message_preview && (
        <div className="conversation-preview">
          {conversation.last_message_preview}
        </div>
      )}
    </div>
  );
}
