/**
 * Dependency View Component
 *
 * Shows task dependencies and blocking relationships
 */

import React, { useState, useEffect } from 'react';

interface DependencyViewProps {
  taskId: string;
  tasks: any[];
}

export default function DependencyView({ taskId, tasks }: DependencyViewProps) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/tasks/dependencies/stats')
      .then(res => res.json())
      .then(setStats)
      .catch(err => console.error('Failed to load dependency stats:', err));
  }, []);

  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    return null;
  }

  const dependencies = (task.dependencies || [])
    .map((depId: string) => tasks.find(t => t.id === depId))
    .filter(Boolean);

  const dependents = tasks.filter(
    t => t.dependencies && t.dependencies.includes(taskId)
  );

  const isBlocked = dependencies.some((dep: any) => dep.status !== 'completed');
  const isBlocking = dependents.length > 0 && task.status !== 'completed';

  return (
    <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '6px', fontSize: '13px' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
        Dependencies
      </h4>

      {/* Dependency Stats */}
      {stats && (
        <div style={{ marginBottom: '12px', padding: '8px', background: '#ffffff', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#6b7280' }}>Total: </span>
              <span style={{ fontWeight: 600 }}>{stats.totalTasks}</span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>With Dependencies: </span>
              <span style={{ fontWeight: 600 }}>{stats.tasksWithDependencies}</span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Blocked: </span>
              <span style={{ fontWeight: 600, color: '#dc2626' }}>{stats.blockedTasks}</span>
            </div>
            {stats.hasCycles && (
              <div style={{ color: '#dc2626', fontWeight: 600 }}>
                ⚠️ Circular dependency detected!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Indicators */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {isBlocked && (
          <span style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            🔒 Blocked
          </span>
        )}
        {isBlocking && (
          <span style={{ padding: '4px 8px', background: '#fef3c7', color: '#ca8a04', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            ⛔ Blocking {dependents.length} task{dependents.length > 1 ? 's' : ''}
          </span>
        )}
        {!isBlocked && dependencies.length > 0 && (
          <span style={{ padding: '4px 8px', background: '#d1fae5', color: '#065f46', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            ✓ Ready
          </span>
        )}
      </div>

      {/* Depends On (Prerequisites) */}
      {dependencies.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
            Depends On ({dependencies.length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {dependencies.map((dep: any) => (
              <div
                key={dep.id}
                style={{
                  padding: '6px 8px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ flex: 1 }}>{dep.title}</span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontWeight: 600,
                    background: dep.status === 'completed' ? '#d1fae5' : '#fee2e2',
                    color: dep.status === 'completed' ? '#065f46' : '#dc2626',
                  }}
                >
                  {dep.status === 'completed' ? '✓' : '○'} {dep.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocking (Dependents) */}
      {dependents.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
            Blocking ({dependents.length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {dependents.map((dep: any) => (
              <div
                key={dep.id}
                style={{
                  padding: '6px 8px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                }}
              >
                <span>{dep.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Dependencies */}
      {dependencies.length === 0 && dependents.length === 0 && (
        <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
          No dependencies
        </div>
      )}
    </div>
  );
}
