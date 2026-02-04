import { useState, useEffect } from 'react';
import '../styles/design-system.css';

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
      padding: 'var(--padding-xl)',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)',
        color: 'var(--text-bright)',
        padding: 'var(--padding-lg) var(--padding-xl)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        marginBottom: 0,
      }}>
        <h1 style={{ margin: 0, fontSize: 'var(--font-xl)', fontWeight: 600 }}>User Preferences</h1>
        <p style={{ margin: 'var(--gap-sm) 0 0 0', fontSize: 'var(--font-md)', opacity: 0.9 }}>
          Manage coding style, tool choices, and workflow preferences
        </p>
      </div>

      {/* Action buttons */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '2px solid var(--border-primary)',
        borderTop: 'none',
        padding: 'var(--padding-lg)',
        display: 'flex',
        gap: 'var(--gap-md)',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={showAddForm ? 'button primary' : 'button secondary'}
        >
          {showAddForm ? 'Cancel' : '+ Add Preference'}
        </button>

        <button
          onClick={() => setShowInferForm(!showInferForm)}
          style={{
            background: showInferForm ? 'var(--accent-green)' : 'var(--bg-tertiary)',
            color: showInferForm ? 'var(--bg-primary)' : 'var(--accent-green)',
            border: '2px solid var(--accent-green)',
            padding: 'var(--padding-sm) var(--padding-md)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-md)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showInferForm ? 'Cancel' : '🔍 Infer from Code'}
        </button>

        <button
          onClick={loadGuidance}
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--accent-yellow)',
            border: '2px solid var(--accent-yellow)',
            padding: 'var(--padding-sm) var(--padding-md)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-md)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📖 View Guidance
        </button>

        <button
          onClick={loadPreferences}
          disabled={loading}
          className="button secondary"
          style={{
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
          background: 'var(--bg-tertiary)',
          border: '2px solid var(--accent-blue)',
          borderTop: 'none',
          padding: 'var(--padding-lg)',
        }}>
          <h3 style={{ margin: '0 0 var(--gap-lg) 0', fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text-bright)' }}>Add Explicit Preference</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-sm)', fontWeight: 600, marginBottom: 'var(--gap-xs)', color: 'var(--text-secondary)' }}>Domain</label>
              <select
                value={newPref.domain}
                onChange={(e) => setNewPref({ ...newPref, domain: e.target.value })}
                style={{
                  width: '100%',
                  padding: 'var(--padding-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  fontSize: 'var(--font-md)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
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
              <label style={{ display: 'block', fontSize: 'var(--font-sm)', fontWeight: 600, marginBottom: 'var(--gap-xs)', color: 'var(--text-secondary)' }}>Category</label>
              <input
                type="text"
                value={newPref.category}
                onChange={(e) => setNewPref({ ...newPref, category: e.target.value })}
                placeholder="e.g., indentation, test_framework, commit_style"
                style={{
                  width: '100%',
                  padding: 'var(--padding-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  fontSize: 'var(--font-md)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-sm)', fontWeight: 600, marginBottom: 'var(--gap-xs)', color: 'var(--text-secondary)' }}>Preference</label>
              <input
                type="text"
                value={newPref.preference}
                onChange={(e) => setNewPref({ ...newPref, preference: e.target.value })}
                placeholder="e.g., use_4_spaces, prefer_pytest"
                style={{
                  width: '100%',
                  padding: 'var(--padding-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  fontSize: 'var(--font-md)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-sm)', fontWeight: 600, marginBottom: 'var(--gap-xs)', color: 'var(--text-secondary)' }}>Value (optional)</label>
              <input
                type="text"
                value={newPref.value}
                onChange={(e) => setNewPref({ ...newPref, value: e.target.value })}
                placeholder="e.g., 4, pytest, conventional"
                style={{
                  width: '100%',
                  padding: 'var(--padding-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  fontSize: 'var(--font-md)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <button
              onClick={addPreference}
              className="button primary"
            >
              Add Preference
            </button>
          </div>
        </div>
      )}

      {/* Infer preferences form */}
      {showInferForm && (
        <div style={{
          background: 'var(--accent-green-dark)',
          border: '2px solid var(--accent-green)',
          borderTop: 'none',
          padding: 'var(--padding-lg)',
        }}>
          <h3 style={{ margin: '0 0 var(--gap-lg) 0', fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text-bright)' }}>Infer Preferences from Code</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-sm)', fontWeight: 600, marginBottom: 'var(--gap-xs)', color: 'var(--text-secondary)' }}>
                File Paths (one per line)
              </label>
              <textarea
                value={inferFiles}
                onChange={(e) => setInferFiles(e.target.value)}
                placeholder="forgekeeper/core/agent/autonomous.mjs&#10;frontend/src/App.tsx&#10;tests/test_chat_basic.py"
                rows={5}
                style={{
                  width: '100%',
                  padding: 'var(--padding-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  fontSize: 'var(--font-md)',
                  fontFamily: 'var(--font-family-mono)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <button
              onClick={inferPreferences}
              disabled={inferring}
              style={{
                background: 'var(--accent-green)',
                color: 'var(--bg-primary)',
                border: 'none',
                padding: 'var(--padding-md) var(--padding-lg)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-md)',
                fontWeight: 600,
                cursor: inferring ? 'not-allowed' : 'pointer',
                opacity: inferring ? 0.5 : 1,
              }}
            >
              {inferring ? 'Analyzing...' : 'Infer Preferences'}
            </button>

            {inferResult && (
              <div style={{ marginTop: 'var(--gap-md)' }}>
                <h4 style={{ margin: '0 0 var(--gap-sm) 0', fontSize: 'var(--font-md)', fontWeight: 600, color: 'var(--text-bright)' }}>Results:</h4>
                {inferResult.map((result: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      background: result.status === 'ok' ? 'var(--accent-green-dark)' : 'var(--accent-red-dark)',
                      padding: 'var(--padding-sm)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 'var(--gap-xs)',
                      fontSize: 'var(--font-sm)',
                      border: `1px solid ${result.status === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                      color: 'var(--text-primary)',
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
          background: 'var(--accent-yellow-dark)',
          border: '2px solid var(--accent-yellow)',
          borderTop: 'none',
          padding: 'var(--padding-lg)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--gap-md)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text-bright)' }}>Preference Guidance</h3>
            <button
              onClick={() => setShowGuidance(false)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 'var(--font-xl)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              ×
            </button>
          </div>
          <pre style={{
            background: 'var(--bg-primary)',
            padding: 'var(--padding-lg)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-sm)',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            margin: 0,
            color: 'var(--text-primary)',
          }}>
            {guidance}
          </pre>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          background: 'var(--accent-red-dark)',
          border: '2px solid var(--accent-red)',
          borderTop: 'none',
          padding: 'var(--padding-lg)',
          color: 'var(--accent-red)',
          fontSize: 'var(--font-md)',
        }}>
          Error: {error}
        </div>
      )}

      {/* Preferences list */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '2px solid var(--border-primary)',
        borderTop: showAddForm || showInferForm || showGuidance || error ? 'none' : '2px solid var(--border-primary)',
        borderRadius: showAddForm || showInferForm || showGuidance || error ? '0 0 var(--radius-lg) var(--radius-lg)' : '0 0 var(--radius-lg) var(--radius-lg)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 'var(--padding-3xl)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Loading preferences...
          </div>
        ) : preferences.length === 0 ? (
          <div style={{ padding: 'var(--padding-3xl)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <p style={{ margin: 0, fontSize: 'var(--font-lg)', color: 'var(--text-secondary)' }}>No preferences found</p>
            <p style={{ margin: 'var(--gap-sm) 0 0 0', fontSize: 'var(--font-md)' }}>
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
                <div key={domain} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  {/* Domain header */}
                  <div
                    onClick={() => toggleDomain(domain)}
                    style={{
                      padding: 'var(--padding-lg) var(--padding-xl)',
                      background: isExpanded ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text-bright)' }}>
                        {domainName}
                      </span>
                      <span style={{ marginLeft: 'var(--gap-md)', fontSize: 'var(--font-md)', color: 'var(--text-secondary)' }}>
                        {prefs.length} preference{prefs.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--font-xl)', color: 'var(--text-tertiary)' }}>
                      {isExpanded ? '−' : '+'}
                    </span>
                  </div>

                  {/* Preferences in this domain */}
                  {isExpanded && (
                    <div style={{ padding: '0 var(--padding-xl) var(--padding-lg) var(--padding-xl)' }}>
                      {prefs.map((pref) => (
                        <div
                          key={pref.preference_id}
                          style={{
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--padding-lg)',
                            marginBottom: 'var(--gap-md)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', marginBottom: 'var(--gap-sm)' }}>
                                <span style={{
                                  background: pref.source === 'explicit' ? 'var(--accent-blue)' : pref.source === 'inferred' ? 'var(--accent-green)' : 'var(--accent-yellow)',
                                  color: 'var(--bg-primary)',
                                  fontSize: 'var(--font-xs)',
                                  fontWeight: 600,
                                  padding: '2px var(--padding-sm)',
                                  borderRadius: 'var(--radius-sm)',
                                }}>
                                  {pref.source.toUpperCase()}
                                </span>
                                {pref.confidence < 1.0 && (
                                  <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                                    {Math.round(pref.confidence * 100)}% confidence
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--gap-xs)' }}>
                                <strong style={{ color: 'var(--text-bright)' }}>{pref.category.replace(/_/g, ' ')}</strong>
                                {': '}
                                <span style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>{pref.preference}</span>
                              </div>

                              {pref.value && (
                                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--gap-xs)' }}>
                                  Value: {typeof pref.value === 'object' ? JSON.stringify(pref.value) : String(pref.value)}
                                </div>
                              )}

                              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', marginTop: 'var(--gap-sm)' }}>
                                Observed {pref.observation_count} time{pref.observation_count !== 1 ? 's' : ''}
                                {' · '}
                                Last: {new Date(pref.last_observed).toLocaleDateString()}
                              </div>
                            </div>

                            <button
                              onClick={() => deletePreference(pref.preference_id)}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--accent-red)',
                                color: 'var(--accent-red)',
                                padding: 'var(--padding-xs) var(--padding-md)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: 'var(--font-sm)',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginLeft: 'var(--gap-lg)',
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
