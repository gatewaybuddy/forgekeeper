/**
 * PRPreviewModal - Enhanced PR preview with diff visualization and file validation
 *
 * Features:
 * - File validation display (allowed/blocked with visual indicators)
 * - Diff visualization with syntax highlighting
 * - Stats display (lines added/removed, files changed)
 * - Branch name preview
 * - Safety warnings
 */

import React from 'react';

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  lineNumber?: number;
}

interface PRPreviewData {
  preview?: {
    previewId: string;
    dryRun: boolean;
    enabled: boolean;
    currentBranch: string;
    proposedBranch: string;
    title: string;
    body: string;
    labels: string[];
    files: {
      total: number;
      allowed: number;
      blocked: number;
      allowedFiles: string[];
      blockedFiles: string[];
    };
    diffs: Record<string, string>;
    stats: {
      filesChanged: number;
      linesAdded: number;
      linesRemoved: number;
    };
    allowlist: string[];
    autoMerge: boolean;
    warnings: Array<{
      type: string;
      message: string;
      files?: string[];
    }>;
  };
}

interface PRPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: PRPreviewData | null;
  onCreatePR: () => void;
  loading?: boolean;
  error?: string | null;
  canCreate?: boolean;
  disabledReason?: string;
}

function parseDiff(diffText: string): DiffLine[] {
  if (!diffText) return [];

  const lines = diffText.split('\n');
  const parsed: DiffLine[] = [];

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      parsed.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      parsed.push({ type: 'add', content: line });
    } else if (line.startsWith('-')) {
      parsed.push({ type: 'remove', content: line });
    } else {
      parsed.push({ type: 'context', content: line });
    }
  }

  return parsed;
}

function DiffViewer({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  const getLineStyle = (type: DiffLine['type']): React.CSSProperties => {
    switch (type) {
      case 'add':
        return { backgroundColor: '#dcfce7', color: '#166534', borderLeft: '3px solid #22c55e' };
      case 'remove':
        return { backgroundColor: '#fee2e2', color: '#991b1b', borderLeft: '3px solid #ef4444' };
      case 'header':
        return { backgroundColor: '#f3f4f6', color: '#4b5563', fontWeight: 600 };
      default:
        return { color: '#6b7280' };
    }
  };

  return (
    <pre style={{
      margin: 0,
      padding: 12,
      background: '#fafafa',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      fontSize: 13,
      fontFamily: 'ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", monospace',
      overflow: 'auto',
      maxHeight: 400,
    }}>
      {lines.map((line, idx) => (
        <div
          key={idx}
          style={{
            ...getLineStyle(line.type),
            padding: '2px 8px',
            margin: '1px 0',
          }}
        >
          {line.content}
        </div>
      ))}
    </pre>
  );
}

interface FileValidationProps {
  files: {
    total: number;
    allowed: number;
    blocked: number;
    allowedFiles: string[];
    blockedFiles: string[];
  };
}

function FileValidationDisplay({ files }: FileValidationProps) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#334155' }}>
        File Validation
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{
          flex: 1,
          padding: 12,
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>
            {files.allowed}
          </div>
          <div style={{ fontSize: 12, color: '#15803d' }}>Allowed Files</div>
        </div>

        <div style={{
          flex: 1,
          padding: 12,
          background: files.blocked > 0 ? '#fef2f2' : '#f9fafb',
          border: `1px solid ${files.blocked > 0 ? '#fca5a5' : '#e5e7eb'}`,
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: files.blocked > 0 ? '#dc2626' : '#9ca3af' }}>
            {files.blocked}
          </div>
          <div style={{ fontSize: 12, color: files.blocked > 0 ? '#b91c1c' : '#6b7280' }}>Blocked Files</div>
        </div>
      </div>

      {files.allowedFiles.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#059669', marginBottom: 4 }}>
            ✅ Allowed ({files.allowedFiles.length})
          </div>
          <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 13 }}>
            {files.allowedFiles.map((file: string, idx: number) => (
              <li key={idx} style={{ color: '#065f46', marginBottom: 2 }}>
                <code style={{ background: '#f0fdf4', padding: '2px 6px', borderRadius: 3 }}>
                  {file}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.blockedFiles.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>
            ❌ Blocked ({files.blockedFiles.length})
          </div>
          <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 13 }}>
            {files.blockedFiles.map((file: string, idx: number) => (
              <li key={idx} style={{ color: '#991b1b', marginBottom: 2 }}>
                <code style={{ background: '#fef2f2', padding: '2px 6px', borderRadius: 3 }}>
                  {file}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface StatsDisplayProps {
  stats: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

function StatsDisplay({ stats }: StatsDisplayProps) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#334155' }}>
        Changes Summary
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{
          flex: 1,
          padding: 12,
          background: '#fafafa',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#334155' }}>
            {stats.filesChanged}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Files Changed</div>
        </div>

        <div style={{
          flex: 1,
          padding: 12,
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#16a34a' }}>
            +{stats.linesAdded}
          </div>
          <div style={{ fontSize: 12, color: '#15803d' }}>Lines Added</div>
        </div>

        <div style={{
          flex: 1,
          padding: 12,
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#dc2626' }}>
            -{stats.linesRemoved}
          </div>
          <div style={{ fontSize: 12, color: '#b91c1c' }}>Lines Removed</div>
        </div>
      </div>
    </div>
  );
}

interface WarningsDisplayProps {
  warnings: Array<{
    type: string;
    message: string;
    files?: string[];
  }>;
}

function WarningsDisplay({ warnings }: WarningsDisplayProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      {warnings.map((warning: { type: string; message: string; files?: string[] }, idx: number) => (
        <div
          key={idx}
          style={{
            padding: 12,
            background: warning.type === 'disabled' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${warning.type === 'disabled' ? '#fca5a5' : '#fde68a'}`,
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          <div style={{
            fontWeight: 600,
            color: warning.type === 'disabled' ? '#991b1b' : '#92400e',
            marginBottom: 4,
          }}>
            ⚠️ {warning.message}
          </div>
          {warning.files && warning.files.length > 0 && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Files: {warning.files.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PRPreviewModal({
  isOpen,
  onClose,
  preview,
  onCreatePR,
  loading = false,
  error = null,
  canCreate = true,
  disabledReason = '',
}: PRPreviewModalProps) {
  if (!isOpen) return null;

  const previewData = preview?.preview;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
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
          width: 'min(1000px, 95vw)',
          maxHeight: '90vh',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: 20,
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f9fafb',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>
              Pull Request Preview
            </h2>
            {previewData?.dryRun && (
              <div style={{ fontSize: 13, color: '#059669', marginTop: 4 }}>
                🔒 Safe Preview Mode (No Git Operations)
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 24,
              cursor: 'pointer',
              color: '#6b7280',
              padding: 8,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              Loading preview...
            </div>
          )}

          {error && (
            <div style={{
              padding: 16,
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              color: '#991b1b',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>❌ Error</div>
              {error}
            </div>
          )}

          {previewData && !loading && !error && (
            <>
              {/* PR Details */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#334155' }}>
                  PR Details
                </div>
                <div style={{
                  padding: 12,
                  background: '#fafafa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                }}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Title:</div>
                    <div style={{ fontWeight: 600 }}>{previewData.title}</div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Branch:</div>
                    <code style={{
                      background: '#f3f4f6',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 13,
                    }}>
                      {previewData.currentBranch} → {previewData.proposedBranch}
                    </code>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Labels:</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {previewData.labels.map((label, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: '2px 8px',
                            background: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warnings */}
              <WarningsDisplay warnings={previewData.warnings} />

              {/* File Validation */}
              <FileValidationDisplay files={previewData.files} />

              {/* Stats */}
              <StatsDisplay stats={previewData.stats} />

              {/* Diffs */}
              {previewData.stats.filesChanged > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#334155' }}>
                    File Changes ({Object.keys(previewData.diffs).length})
                  </div>
                  {Object.entries(previewData.diffs).map(([file, diff], idx) => (
                    <details key={idx} style={{ marginBottom: 12 }} open={idx === 0}>
                      <summary style={{
                        cursor: 'pointer',
                        padding: 8,
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        fontWeight: 600,
                        color: '#374151',
                      }}>
                        <code>{file}</code>
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        <DiffViewer diff={diff} />
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: 16,
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {previewData && !previewData.enabled && (
              <span style={{ color: '#dc2626' }}>⚠️ SAPL disabled (set AUTO_PR_ENABLED=1)</span>
            )}
            {previewData && previewData.enabled && previewData.dryRun && (
              <span style={{ color: '#ca8a04' }}>ℹ️ Dry-run mode (set AUTO_PR_DRYRUN=0 to create PRs)</span>
            )}
            {previewData && previewData.enabled && !previewData.dryRun && canCreate && (
              <span style={{ color: '#059669' }}>✅ Ready to create PR</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                background: '#fff',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onCreatePR}
              disabled={!canCreate || loading || !previewData?.enabled || previewData?.dryRun}
              title={disabledReason}
              style={{
                padding: '8px 20px',
                border: 'none',
                background: canCreate && !loading && previewData?.enabled && !previewData?.dryRun
                  ? '#2563eb'
                  : '#d1d5db',
                color: '#fff',
                borderRadius: 6,
                cursor: canCreate && !loading && previewData?.enabled && !previewData?.dryRun
                  ? 'pointer'
                  : 'not-allowed',
                fontWeight: 600,
              }}
            >
              {loading ? 'Creating...' : 'Create PR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
