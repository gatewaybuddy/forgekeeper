/**
 * Template Selector Component
 *
 * Allows users to select a template and create tasks from it
 */

import React, { useState, useEffect } from 'react';

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  taskType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  defaultPriority: number;
  titlePattern: string;
  descriptionPattern: string;
  suggestedFixPattern?: string;
  acceptanceCriteria?: string[];
  tags?: string[];
}

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: () => void;
}

export default function TemplateSelector({ isOpen, onClose, onTaskCreated }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  async function fetchTemplates() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function createTaskFromTemplate() {
    if (!selectedTemplate) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/from-template/${selectedTemplate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables }),
      });

      if (!response.ok) throw new Error('Failed to create task from template');

      // Success
      onTaskCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  function extractVariables(template: TaskTemplate): string[] {
    const vars = new Set<string>();
    const regex = /\{(\w+)\}/g;

    [template.titlePattern, template.descriptionPattern].forEach(text => {
      if (text) {
        let match;
        while ((match = regex.exec(text)) !== null) {
          vars.add(match[1]);
        }
      }
    });

    return Array.from(vars);
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>
              Create Task from Template
            </h2>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                background: 'transparent',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#6b7280',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
          {/* Template List */}
          <div style={{ width: '300px', borderRight: '1px solid #e5e7eb', overflow: 'auto' }}>
            {loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                Loading templates...
              </div>
            )}

            {error && !loading && (
              <div style={{ padding: '20px', color: '#dc2626', fontSize: '14px' }}>
                Error: {error}
              </div>
            )}

            {!loading && !error && templates.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                No templates available
              </div>
            )}

            {!loading && templates.map(template => (
              <div
                key={template.id}
                onClick={() => {
                  setSelectedTemplate(template);
                  setVariables({});
                }}
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #e5e7eb',
                  background: selectedTemplate?.id === template.id ? '#eff6ff' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (selectedTemplate?.id !== template.id) {
                    e.currentTarget.style.background = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedTemplate?.id !== template.id) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                  {template.name}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {template.description}
                </div>
              </div>
            ))}
          </div>

          {/* Template Details */}
          <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
            {!selectedTemplate && (
              <div style={{ textAlign: 'center', color: '#6b7280', paddingTop: '60px' }}>
                Select a template to get started
              </div>
            )}

            {selectedTemplate && (
              <>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                  {selectedTemplate.name}
                </h3>

                <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
                  {selectedTemplate.description}
                </p>

                {/* Variable Inputs */}
                {extractVariables(selectedTemplate).length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                      Fill in Details
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {extractVariables(selectedTemplate).map(varName => (
                        <div key={varName}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                            {varName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </label>
                          <input
                            type="text"
                            value={variables[varName] || ''}
                            onChange={(e) => setVariables({ ...variables, [varName]: e.target.value })}
                            placeholder={`Enter ${varName.replace(/_/g, ' ')}`}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '14px',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview */}
                <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                    Preview
                  </h4>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                    {selectedTemplate.titlePattern.replace(/\{(\w+)\}/g, (_, key) => variables[key] || `{${key}}`)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'pre-wrap' }}>
                    {selectedTemplate.descriptionPattern.replace(/\{(\w+)\}/g, (_, key) => variables[key] || `{${key}}`)}
                  </div>
                </div>

                {/* Create Button */}
                <button
                  onClick={createTaskFromTemplate}
                  disabled={creating}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: creating ? '#9ca3af' : '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: creating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creating ? 'Creating...' : 'Create Task'}
                </button>

                {error && (
                  <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '13px' }}>
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
