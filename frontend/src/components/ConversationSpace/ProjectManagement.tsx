/**
 * ProjectManagement - Modal for creating and managing projects
 *
 * Features:
 * - Create new projects
 * - Edit existing projects
 * - Delete projects
 * - Assign color to projects
 * - Move conversations between projects
 */

import React, { useState, useEffect } from 'react';
import './ProjectManagement.css';

interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

interface ProjectManagementProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: () => void;
}

const PRESET_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Indigo', value: '#6366f1' },
];

export function ProjectManagement({ isOpen, onClose, onProjectCreated }: ProjectManagementProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New project form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0].value);

  // Edit project form
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/conversation-space/projects');
      const data = await res.json();

      if (data.success) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newName.trim()) return;

    try {
      setCreating(true);

      const res = await fetch('/api/conversation-space/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
          color: newColor
        })
      });

      const data = await res.json();

      if (data.success) {
        setProjects([...projects, data.project]);
        setNewName('');
        setNewDescription('');
        setNewColor(PRESET_COLORS[0].value);
        if (onProjectCreated) onProjectCreated();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error creating project: ${err}`);
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description);
    setEditColor(project.color);
  };

  const handleSaveEdit = async (projectId: string) => {
    try {
      const res = await fetch(`/api/conversation-space/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
          color: editColor
        })
      });

      const data = await res.json();

      if (data.success) {
        setProjects(projects.map(p => p.id === projectId ? data.project : p));
        setEditingId(null);
        if (onProjectCreated) onProjectCreated();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error updating project: ${err}`);
    }
  };

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? Conversations in this project will be moved to "No Project".`)) {
      return;
    }

    try {
      const res = await fetch(`/api/conversation-space/projects/${projectId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setProjects(projects.filter(p => p.id !== projectId));
        if (onProjectCreated) onProjectCreated();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error deleting project: ${err}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="project-management-overlay" onClick={onClose}>
      <div className="project-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Projects</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Create New Project */}
          <div className="create-project-section">
            <h3>Create New Project</h3>
            <form onSubmit={handleCreate} className="project-form">
              <div className="form-group">
                <label>Project Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Client Work, Personal Projects"
                  required
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                  maxLength={200}
                />
              </div>

              <div className="form-group">
                <label>Color</label>
                <div className="color-picker">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      className={`color-option ${newColor === color.value ? 'active' : ''}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setNewColor(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <button type="submit" className="create-btn" disabled={creating || !newName.trim()}>
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </form>
          </div>

          {/* Existing Projects */}
          <div className="projects-list-section">
            <h3>Existing Projects</h3>
            {loading ? (
              <div className="loading">Loading...</div>
            ) : projects.length === 0 ? (
              <div className="empty-state">No projects yet. Create one above!</div>
            ) : (
              <div className="projects-list">
                {projects.map(project => (
                  <div key={project.id} className="project-item">
                    {editingId === project.id ? (
                      // Edit Mode
                      <div className="project-edit-form">
                        <div className="form-group">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Project name"
                          />
                        </div>
                        <div className="form-group">
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Description"
                            rows={2}
                          />
                        </div>
                        <div className="form-group">
                          <div className="color-picker">
                            {PRESET_COLORS.map(color => (
                              <button
                                key={color.value}
                                type="button"
                                className={`color-option ${editColor === color.value ? 'active' : ''}`}
                                style={{ backgroundColor: color.value }}
                                onClick={() => setEditColor(color.value)}
                                title={color.name}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="edit-actions">
                          <button onClick={() => handleSaveEdit(project.id)} className="save-btn">
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="cancel-btn">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <>
                        <div className="project-info">
                          <div
                            className="project-color"
                            style={{ backgroundColor: project.color }}
                          />
                          <div className="project-details">
                            <div className="project-name">{project.name}</div>
                            {project.description && (
                              <div className="project-description">{project.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="project-actions">
                          <button onClick={() => handleStartEdit(project)} className="edit-btn">
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(project.id, project.name)}
                            className="delete-btn"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
