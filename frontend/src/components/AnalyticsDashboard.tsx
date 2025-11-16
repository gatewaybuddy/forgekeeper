/**
 * Analytics Dashboard Component
 *
 * Displays comprehensive analytics and insights for TGT (Telemetry-Driven Task Generator).
 * Provides time-series charts, metrics, distributions, and automated recommendations.
 */

import React, { useEffect, useState } from 'react';
import TaskFunnelChart from './TaskFunnelChart';

interface TimeSeriesData {
  date: string;
  timestamp: number;
  total: number;
  byStatus: {
    generated: number;
    approved: number;
    dismissed: number;
    completed: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byType: Record<string, number>;
}

interface Trend {
  value: number;
  direction: 'up' | 'down' | 'stable';
  description: string;
}

interface Overview {
  totalTasks: number;
  generatedTasks: number;
  approvedTasks: number;
  dismissedTasks: number;
  approvalRate: number;
  dismissalRate: number;
  avgTimeToActionHours: number;
  trend: Trend;
}

interface TaskType {
  type: string;
  count: number;
}

interface DismissalReason {
  reason: string;
  count: number;
}

interface PriorityDistribution {
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
  veryLow: number;
}

interface SeverityDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface Recommendation {
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
}

interface AnalyticsData {
  overview: Overview;
  timeSeries: {
    timeRange: {
      start: string;
      end: string;
      daysBack: number;
    };
    daily: TimeSeriesData[];
  };
  topTypes: TaskType[];
  dismissalReasons: DismissalReason[];
  priorityDistribution: PriorityDistribution;
  severityDistribution: SeverityDistribution;
  recommendations: Recommendation[];
}

interface AnalyticsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AnalyticsDashboard({ isOpen }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(7);

  useEffect(() => {
    if (!isOpen) return;

    const fetchAnalytics = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/tasks/analytics?daysBack=${daysBack}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch analytics: ${response.statusText}`);
        }

        const data = await response.json();
        setAnalytics(data.analytics);
      } catch (err) {
        console.error('[Analytics] Error fetching analytics:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [isOpen, daysBack]);

  if (!isOpen) return null;

  return (
    <>
      {/* Date Range Selector */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#ffffff' }}>
        <label style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>Time Range:</label>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              onClick={() => setDaysBack(days)}
              style={{
                padding: '6px 16px',
                border: `1px solid ${daysBack === days ? '#3b82f6' : '#d1d5db'}`,
                borderRadius: '6px',
                background: daysBack === days ? '#eff6ff' : '#ffffff',
                color: daysBack === days ? '#3b82f6' : '#374151',
                fontSize: '13px',
                fontWeight: daysBack === days ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f9fafb' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '14px' }}>
            Loading analytics...
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '14px',
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && analytics && (
          <>
            {/* Overview Metrics */}
            <OverviewSection overview={analytics.overview} />

            {/* Time Series Chart */}
            <TimeSeriesChart data={analytics.timeSeries.daily} />

            {/* Task Lifecycle Funnel */}
            <TaskFunnelChart daysBack={daysBack} />

            {/* Top Task Types and Dismissal Reasons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
              <TopTaskTypes types={analytics.topTypes} />
              <DismissalReasons reasons={analytics.dismissalReasons} />
            </div>

            {/* Priority and Severity Distributions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
              <PriorityDistributionChart distribution={analytics.priorityDistribution} />
              <SeverityDistributionChart distribution={analytics.severityDistribution} />
            </div>

            {/* Recommendations */}
            {analytics.recommendations.length > 0 && (
              <RecommendationsSection recommendations={analytics.recommendations} />
            )}
          </>
        )}
      </div>
    </>
  );
}

function OverviewSection({ overview }: { overview: Overview }) {
  const trendColor =
    overview.trend.direction === 'up' ? '#059669' : overview.trend.direction === 'down' ? '#dc2626' : '#6b7280';
  const trendIcon = overview.trend.direction === 'up' ? '↑' : overview.trend.direction === 'down' ? '↓' : '→';

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
        Overview
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <MetricCard label="Total Tasks" value={overview.totalTasks} />
        <MetricCard label="Generated" value={overview.generatedTasks} color="#3b82f6" />
        <MetricCard label="Approved" value={overview.approvedTasks} color="#059669" />
        <MetricCard label="Dismissed" value={overview.dismissedTasks} color="#dc2626" />
        <MetricCard label="Approval Rate" value={`${overview.approvalRate.toFixed(1)}%`} />
        <MetricCard label="Avg Time to Action" value={`${overview.avgTimeToActionHours.toFixed(1)}h`} />
      </div>
      <div
        style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#f3f4f6',
          borderRadius: '8px',
          borderLeft: `4px solid ${trendColor}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px', color: trendColor }}>{trendIcon}</span>
          <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
            {overview.trend.description}
          </span>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color = '#374151',
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: '16px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
      }}
    >
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function TimeSeriesChart({ data }: { data: TimeSeriesData[] }) {
  const maxValue = Math.max(...data.map((d) => d.total), 1);

  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
        Task Generation Over Time
      </h3>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '200px' }}>
          {data.map((day) => {
            const height = (day.total / maxValue) * 100;
            return (
              <div
                key={day.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${height}%`,
                    background: 'linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)',
                    borderRadius: '4px 4px 0 0',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                  title={`${day.date}: ${day.total} tasks`}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  {day.total > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-20px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      {day.total}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#6b7280',
                    marginTop: '8px',
                    transform: 'rotate(-45deg)',
                    transformOrigin: 'left top',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {new Date(day.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TopTaskTypes({ types }: { types: TaskType[] }) {
  const maxCount = Math.max(...types.map((t) => t.count), 1);

  return (
    <div>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
        Top Task Types
      </h3>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        {types.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>No data</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {types.map((type) => (
              <div key={type.type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{type.type}</span>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{type.count}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px' }}>
                  <div
                    style={{
                      width: `${(type.count / maxCount) * 100}%`,
                      height: '100%',
                      background: '#3b82f6',
                      borderRadius: '4px',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DismissalReasons({ reasons }: { reasons: DismissalReason[] }) {
  const maxCount = Math.max(...reasons.map((r) => r.count), 1);

  return (
    <div>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
        Common Dismissal Reasons
      </h3>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        {reasons.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>No data</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reasons.map((reason, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span
                    style={{
                      fontSize: '13px',
                      color: '#374151',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '70%',
                    }}
                    title={reason.reason}
                  >
                    {reason.reason}
                  </span>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{reason.count}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px' }}>
                  <div
                    style={{
                      width: `${(reason.count / maxCount) * 100}%`,
                      height: '100%',
                      background: '#dc2626',
                      borderRadius: '4px',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PriorityDistributionChart({ distribution }: { distribution: PriorityDistribution }) {
  const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);

  const priorities = [
    { label: 'Very High', value: distribution.veryHigh, color: '#dc2626' },
    { label: 'High', value: distribution.high, color: '#f59e0b' },
    { label: 'Medium', value: distribution.medium, color: '#3b82f6' },
    { label: 'Low', value: distribution.low, color: '#10b981' },
    { label: 'Very Low', value: distribution.veryLow, color: '#6b7280' },
  ];

  return (
    <div>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
        Priority Distribution
      </h3>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        {total === 0 ? (
          <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>No data</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {priorities.map((priority) => (
              <div key={priority.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    background: priority.color,
                    borderRadius: '3px',
                  }}
                />
                <span style={{ fontSize: '13px', color: '#374151', flex: 1 }}>{priority.label}</span>
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
                  {priority.value} ({total > 0 ? ((priority.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityDistributionChart({ distribution }: { distribution: SeverityDistribution }) {
  const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);

  const severities = [
    { label: 'Critical', value: distribution.critical, color: '#dc2626' },
    { label: 'High', value: distribution.high, color: '#f59e0b' },
    { label: 'Medium', value: distribution.medium, color: '#3b82f6' },
    { label: 'Low', value: distribution.low, color: '#10b981' },
  ];

  return (
    <div>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
        Severity Distribution
      </h3>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        {total === 0 ? (
          <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>No data</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {severities.map((severity) => (
              <div key={severity.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    background: severity.color,
                    borderRadius: '3px',
                  }}
                />
                <span style={{ fontSize: '13px', color: '#374151', flex: 1 }}>{severity.label}</span>
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
                  {severity.value} ({total > 0 ? ((severity.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationsSection({ recommendations }: { recommendations: Recommendation[] }) {
  const severityColors = {
    high: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
    medium: { bg: '#fef9e7', border: '#fde68a', text: '#92400e' },
    low: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  };

  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
        Recommendations
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {recommendations.map((rec, idx) => {
          const colors = severityColors[rec.severity];
          return (
            <div
              key={idx}
              style={{
                padding: '16px',
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                borderLeft: `4px solid ${colors.text}`,
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '8px' }}>
                {rec.title}
              </div>
              <div style={{ fontSize: '13px', color: '#374151', marginBottom: '8px' }}>
                {rec.description}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  fontStyle: 'italic',
                }}
              >
                💡 {rec.action}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
