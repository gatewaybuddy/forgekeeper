import { useState, useEffect } from 'react';

/**
 * PreferencesPanel - UI for managing user preferences (Phase 5 Option D)
 *
 * Features:
 * - View all preferences grouped by domain
 * - Add explicit preferences
 * - Delete preferences
 * - Trigger inference on files
 * - View preference guidance
 */

interface UserPreference {
  preference_id: string;
  user_id: string;
  domain: string;
  category: string;
  preference: string;
  value: string | number | boolean;
  confidence: number;
  source: 'explicit' | 'inferred' | 'observed';
  observation_count: number;
  last_observed: string;
  created_at: string;
  applies_to?: object;
}

interface PreferencesByDomain {
  [domain: string]: UserPreference[];
}

export function PreferencesPanel() {
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(['coding_style']));

  // Add preference form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPref, setNewPref] = useState({
    domain: 'coding_style',
    category: '',
    preference: '',
    value: '',
  });

  // Infer preferences form state
  const [showInferForm, setShowInferForm] = useState(false);
  const [inferFiles, setInferFiles] = useState('');
  const [inferring, setInferring] = useState(false);
  const [inferResult, setInferResult] = useState<any>(null);

  // Guidance state
  const [guidance, setGuidance] = useState<string | null>(null);
  const [showGuidance, setShowGuidance] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/preferences');
      const data = await resp.json();
      if (data.ok) {
        setPreferences(data.preferences || []);
      } else {
        setError(data.message || 'Failed to load preferences');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadGuidance = async () => {
    try {
      const resp = await fetch('/api/preferences/guidance');
      const data = await resp.json();
      if (data.ok) {
        setGuidance(data.guidance || '');
        setShowGuidance(true);
      }
    } catch (err) {
      console.error('Failed to load guidance:', err);
    }
  };

  const addPreference = async () => {
    if (!newPref.category || !newPref.preference) {
      alert('Category and preference are required');
      return;
    }

    try {
      const resp = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPref),
      });

      const data = await resp.json();
      if (data.ok) {
        setNewPref({ domain: 'coding_style', category: '', preference: '', value: '' });
        setShowAddForm(false);
        await loadPreferences();
      } else {
        alert(data.message || 'Failed to add preference');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const deletePreference = async (id: string) => {
    if (!confirm('Are you sure you want to delete this preference?')) {
      return;
    }

    try {
      const resp = await fetch(`/api/preferences/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.ok) {
        await loadPreferences();
      } else {
        alert(data.message || 'Failed to delete preference');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const inferPreferences = async () => {
    const files = inferFiles.split('\n').map(f => f.trim()).filter(Boolean);
    if (files.length === 0) {
      alert('Please enter at least one file path');
      return;
    }

    setInferring(true);
    setInferResult(null);

    try {
      const resp = await fetch('/api/preferences/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });

      const data = await resp.json();
      if (data.ok) {
        setInferResult(data.results);
        await loadPreferences();
      } else {
        alert(data.message || 'Failed to infer preferences');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setInferring(false);
    }
  };

  const toggleDomain = (domain: string) => {
    const newExpanded = new Set(expandedDomains);
    if (newExpanded.has(domain)) {
      newExpanded.delete(domain);
    } else {
      newExpanded.add(domain);
    }
    setExpandedDomains(newExpanded);
  };

  // Group preferences by domain
  const preferencesByDomain: PreferencesByDomain = preferences.reduce((acc, pref) => {
    if (!acc[pref.domain]) {
      acc[pref.domain] = [];
    }
    acc[pref.domain].push(pref);
    return acc;
  }, {} as PreferencesByDomain);

  const domains = Object.keys(preferencesByDomain).sort();

  return (
    <div style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '20px 24px',
        borderRadius: '12px 12px 0 0',
        marginBottom: 0,
      }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>User Preferences</h1>
        <p style={{ margin: '8px 0 0 0', fontSize: 14, opacity: 0.9 }}>
          Manage coding style, tool choices, and workflow preferences
        </p>
      </div>

      {/* Action buttons */}
      <div style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderTop: 'none',
        padding: 16,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            background: showAddForm ? '#667eea' : 'white',
            color: showAddForm ? 'white' : '#667eea',
            border: '2px solid #667eea',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add Preference'}
        </button>

        <button
          onClick={() => setShowInferForm(!showInferForm)}
          style={{
            background: showInferForm ? '#10b981' : 'white',
            color: showInferForm ? 'white' : '#10b981',
            border: '2px solid #10b981',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showInferForm ? 'Cancel' : '🔍 Infer from Code'}
        </button>

        <button
          onClick={loadGuidance}
          style={{
            background: 'white',
            color: '#f59e0b',
            border: '2px solid #f59e0b',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📖 View Guidance
        </button>

        <button
          onClick={loadPreferences}
          disabled={loading}
          style={{
            background: 'white',
            color: '#6b7280',
            border: '2px solid #e5e7eb',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          🔄 Reload
        </button>
      </div>

      {/* Add preference form */}
      {showAddForm && (
        <div style={{
          background: '#f9fafb',
          border: '2px solid #667eea',
          borderTop: 'none',
          padding: 20,
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>Add Explicit Preference</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Domain</label>
              <select
                value={newPref.domain}
                onChange={(e) => setNewPref({ ...newPref, domain: e.target.value })}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                }}
              >
                <option value="coding_style">Coding Style</option>
                <option value="tool_choice">Tool Choice</option>
                <option value="workflow">Workflow</option>
                <option value="testing">Testing</option>
                <option value="documentation">Documentation</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Category</label>
              <input
                type="text"
                value={newPref.category}
                onChange={(e) => setNewPref({ ...newPref, category: e.target.value })}
                placeholder="e.g., indentation, test_framework, commit_style"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Preference</label>
              <input
                type="text"
                value={newPref.preference}
                onChange={(e) => setNewPref({ ...newPref, preference: e.target.value })}
                placeholder="e.g., use_4_spaces, prefer_pytest"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Value (optional)</label>
              <input
                type="text"
                value={newPref.value}
                onChange={(e) => setNewPref({ ...newPref, value: e.target.value })}
                placeholder="e.g., 4, pytest, conventional"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                }}
              />
            </div>

            <button
              onClick={addPreference}
              style={{
                background: '#667eea',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add Preference
            </button>
          </div>
        </div>
      )}

      {/* Infer preferences form */}
      {showInferForm && (
        <div style={{
          background: '#f0fdf4',
          border: '2px solid #10b981',
          borderTop: 'none',
          padding: 20,
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>Infer Preferences from Code</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                File Paths (one per line)
              </label>
              <textarea
                value={inferFiles}
                onChange={(e) => setInferFiles(e.target.value)}
                placeholder="forgekeeper/core/agent/autonomous.mjs&#10;frontend/src/App.tsx&#10;tests/test_chat_basic.py"
                rows={5}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <button
              onClick={inferPreferences}
              disabled={inferring}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: inferring ? 'not-allowed' : 'pointer',
                opacity: inferring ? 0.5 : 1,
              }}
            >
              {inferring ? 'Analyzing...' : 'Infer Preferences'}
            </button>

            {inferResult && (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600 }}>Results:</h4>
                {inferResult.map((result: PreferenceItem, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      background: result.status === 'ok' ? '#d1fae5' : '#fee2e2',
                      padding: 8,
                      borderRadius: 6,
                      marginBottom: 6,
                      fontSize: 13,
                    }}
                  >
                    <strong>{result.file}</strong>: {result.status === 'ok'
                      ? `${result.observations} observations`
                      : `Error: ${result.error}`
                    }
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guidance display */}
      {showGuidance && guidance && (
        <div style={{
          background: '#fffbeb',
          border: '2px solid #f59e0b',
          borderTop: 'none',
          padding: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Preference Guidance</h3>
            <button
              onClick={() => setShowGuidance(false)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 20,
                cursor: 'pointer',
                color: '#9ca3af',
              }}
            >
              ×
            </button>
          </div>
          <pre style={{
            background: 'white',
            padding: 16,
            borderRadius: 6,
            fontSize: 13,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            margin: 0,
          }}>
            {guidance}
          </pre>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          background: '#fee2e2',
          border: '2px solid #ef4444',
          borderTop: 'none',
          padding: 16,
          color: '#dc2626',
          fontSize: 14,
        }}>
          Error: {error}
        </div>
      )}

      {/* Preferences list */}
      <div style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderTop: showAddForm || showInferForm || showGuidance || error ? 'none' : '2px solid #e5e7eb',
        borderRadius: showAddForm || showInferForm || showGuidance || error ? '0 0 12px 12px' : '0 0 12px 12px',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            Loading preferences...
          </div>
        ) : preferences.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            <p style={{ margin: 0, fontSize: 16 }}>No preferences found</p>
            <p style={{ margin: '8px 0 0 0', fontSize: 14 }}>
              Add explicit preferences or infer them from your code
            </p>
          </div>
        ) : (
          <div>
            {domains.map((domain) => {
              const isExpanded = expandedDomains.has(domain);
              const prefs = preferencesByDomain[domain];
              const domainName = domain.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

              return (
                <div key={domain} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {/* Domain header */}
                  <div
                    onClick={() => toggleDomain(domain)}
                    style={{
                      padding: '16px 20px',
                      background: isExpanded ? '#f9fafb' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>
                        {domainName}
                      </span>
                      <span style={{ marginLeft: 12, fontSize: 14, color: '#6b7280' }}>
                        {prefs.length} preference{prefs.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: 20, color: '#9ca3af' }}>
                      {isExpanded ? '−' : '+'}
                    </span>
                  </div>

                  {/* Preferences in this domain */}
                  {isExpanded && (
                    <div style={{ padding: '0 20px 16px 20px' }}>
                      {prefs.map((pref) => (
                        <div
                          key={pref.preference_id}
                          style={{
                            background: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: 8,
                            padding: 16,
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{
                                  background: pref.source === 'explicit' ? '#667eea' : pref.source === 'inferred' ? '#10b981' : '#f59e0b',
                                  color: 'white',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                }}>
                                  {pref.source.toUpperCase()}
                                </span>
                                {pref.confidence < 1.0 && (
                                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                                    {Math.round(pref.confidence * 100)}% confidence
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: 14, marginBottom: 4 }}>
                                <strong style={{ color: '#374151' }}>{pref.category.replace(/_/g, ' ')}</strong>
                                {': '}
                                <span style={{ color: '#667eea', fontWeight: 500 }}>{pref.preference}</span>
                              </div>

                              {pref.value && (
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                                  Value: {typeof pref.value === 'object' ? JSON.stringify(pref.value) : String(pref.value)}
                                </div>
                              )}

                              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
                                Observed {pref.observation_count} time{pref.observation_count !== 1 ? 's' : ''}
                                {' · '}
                                Last: {new Date(pref.last_observed).toLocaleDateString()}
                              </div>
                            </div>

                            <button
                              onClick={() => deletePreference(pref.preference_id)}
                              style={{
                                background: 'transparent',
                                border: '1px solid #ef4444',
                                color: '#ef4444',
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginLeft: 16,
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
