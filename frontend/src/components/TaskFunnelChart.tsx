/**
 * Task Funnel Chart Component
 *
 * Visualizes the task lifecycle funnel showing conversion rates through stages:
 * Generated → Engaged → Approved → Completed
 *                    ↘ Dismissed
 */

import React, { useCallback, useEffect, useState } from 'react';

interface FunnelStage {
  count: number;
  percentage: number;
  description: string;
}

interface ConversionRate {
  rate: number;
  description: string;
}

interface Dropoff {
  stage: string;
  rate: number;
  description: string;
}

interface FunnelData {
  period: {
    daysBack: number;
    startDate: string;
    endDate: string;
    totalTasks: number;
  };
  stages: {
    generated: FunnelStage;
    engaged: FunnelStage;
    approved: FunnelStage;
    completed: FunnelStage;
    dismissed: FunnelStage;
  };
  conversionRates: {
    generatedToEngaged: ConversionRate;
    engagedToApproved: ConversionRate;
    approvedToCompleted: ConversionRate;
    engagedToDismissed: ConversionRate;
  };
  dropoffs: Dropoff[];
  summary: {
    healthScore: number;
    topIssue: string;
    recommendation: string;
  };
}

interface TaskFunnelChartProps {
  daysBack?: number;
}

export default function TaskFunnelChart({ daysBack = 7 }: TaskFunnelChartProps) {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFunnel = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/funnel?daysBack=${daysBack}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch funnel: ${response.statusText}`);
      }

      const data = await response.json();
      setFunnel(data.funnel);
    } catch (err) {
      console.error('[TaskFunnelChart] Error fetching funnel:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [daysBack]);

  useEffect(() => {
    fetchFunnel();
  }, [fetchFunnel]);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        Loading funnel data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#dc2626' }}>
        Error: {error}
      </div>
    );
  }

  if (!funnel) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        No funnel data available
      </div>
    );
  }

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' }}>
          Task Lifecycle Funnel
        </h3>
        <HealthScoreBadge score={funnel.summary.healthScore} />
      </div>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
        }}
      >
        {/* Funnel Visualization */}
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <FunnelStageBar
            stage="Generated"
            count={funnel.stages.generated.count}
            percentage={funnel.stages.generated.percentage}
            color="#3b82f6"
            width={100}
            isFirst
          />

          <ConversionArrow rate={funnel.conversionRates.generatedToEngaged.rate} />

          <FunnelStageBar
            stage="Engaged"
            count={funnel.stages.engaged.count}
            percentage={funnel.stages.engaged.percentage}
            color="#8b5cf6"
            width={funnel.stages.engaged.percentage}
          />

          <ConversionArrow rate={funnel.conversionRates.engagedToApproved.rate} />

          <FunnelStageBar
            stage="Approved"
            count={funnel.stages.approved.count}
            percentage={funnel.stages.approved.percentage}
            color="#059669"
            width={funnel.stages.approved.percentage}
          />

          <ConversionArrow rate={funnel.conversionRates.approvedToCompleted.rate} />

          <FunnelStageBar
            stage="Completed"
            count={funnel.stages.completed.count}
            percentage={funnel.stages.completed.percentage}
            color="#10b981"
            width={funnel.stages.completed.percentage}
            isLast
          />

          {/* Dismissed Branch (Side) */}
          {funnel.stages.dismissed.count > 0 && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '90px',
                width: '35%',
                opacity: 0.8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '4px',
                  fontSize: '12px',
                  color: '#6b7280',
                }}
              >
                <span style={{ fontSize: '16px' }}>↘</span>
                <span>Dismissed ({funnel.conversionRates.engagedToDismissed.rate.toFixed(1)}%)</span>
              </div>
              <div
                style={{
                  background: '#dc2626',
                  borderRadius: '4px',
                  padding: '12px 16px',
                  color: '#ffffff',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 600 }}>{funnel.stages.dismissed.count}</div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>
                  {funnel.stages.dismissed.percentage.toFixed(1)}% of total
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drop-off Warnings */}
        {funnel.dropoffs.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
              Drop-off Points
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {funnel.dropoffs.map((dropoff, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px 16px',
                    background: '#fef3c7',
                    borderLeft: '4px solid #f59e0b',
                    borderRadius: '4px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: '#78350f', fontWeight: 500 }}>
                    {dropoff.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendation */}
        <div
          style={{
            marginTop: '24px',
            padding: '16px',
            background: '#f3f4f6',
            borderRadius: '8px',
            borderLeft: '4px solid #3b82f6',
          }}
        >
          <div style={{ fontSize: '13px', color: '#111827', fontWeight: 500, marginBottom: '6px' }}>
            Recommendation
          </div>
          <div style={{ fontSize: '13px', color: '#374151' }}>{funnel.summary.recommendation}</div>
        </div>

        {/* Period Info */}
        <div style={{ marginTop: '16px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
          Analyzing {funnel.period.totalTasks} tasks from last {funnel.period.daysBack} days
        </div>
      </div>
    </div>
  );
}

function FunnelStageBar({
  stage,
  count,
  percentage,
  color,
  width,
  isFirst = false,
  isLast = false,
}: {
  stage: string;
  count: number;
  percentage: number;
  color: string;
  width: number;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const displayWidth = Math.max(width, 20); // Minimum 20% width for visibility

  return (
    <div
      style={{
        marginBottom: '8px',
        transition: 'all 0.3s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>{stage}</span>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          {percentage.toFixed(1)}%
        </span>
      </div>
      <div
        style={{
          width: `${displayWidth}%`,
          background: color,
          borderRadius: isFirst ? '8px 8px 0 0' : isLast ? '0 0 8px 8px' : '4px',
          padding: '16px',
          color: '#ffffff',
          position: 'relative',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.3s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        }}
      >
        <div style={{ fontSize: '28px', fontWeight: 600 }}>{count}</div>
        <div style={{ fontSize: '12px', opacity: 0.9 }}>tasks</div>
      </div>
    </div>
  );
}

function ConversionArrow({ rate }: { rate: number }) {
  const color = rate >= 60 ? '#059669' : rate >= 30 ? '#f59e0b' : '#dc2626';
  const icon = rate >= 60 ? '✓' : rate >= 30 ? '!' : '✗';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0',
        fontSize: '13px',
        color,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: '18px' }}>↓</span>
      <span>
        {rate.toFixed(1)}% conversion
      </span>
      <span style={{ fontSize: '14px', marginLeft: 'auto' }}>{icon}</span>
    </div>
  );
}

function HealthScoreBadge({ score }: { score: number }) {
  let color: string;
  let label: string;

  if (score >= 80) {
    color = '#059669';
    label = 'Excellent';
  } else if (score >= 60) {
    color = '#3b82f6';
    label = 'Good';
  } else if (score >= 40) {
    color = '#f59e0b';
    label = 'Fair';
  } else {
    color = '#dc2626';
    label = 'Needs Attention';
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        background: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: '20px',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: color,
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        {score}
      </div>
      <span style={{ fontSize: '13px', color, fontWeight: 500 }}>{label}</span>
    </div>
  );
}
