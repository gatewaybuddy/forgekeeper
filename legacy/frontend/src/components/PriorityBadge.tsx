/**
 * Priority Badge Component
 *
 * Displays task priority score with color-coded visual indicator
 */

import React from 'react';

interface PriorityBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

function getPriorityCategory(score: number) {
  if (score >= 80) {
    return {
      level: 'urgent',
      label: 'Urgent',
      color: '#dc2626',
      bgColor: '#fee2e2',
      icon: '🔥',
    };
  } else if (score >= 60) {
    return {
      level: 'high',
      label: 'High',
      color: '#ea580c',
      bgColor: '#fed7aa',
      icon: '⚠️',
    };
  } else if (score >= 40) {
    return {
      level: 'medium',
      label: 'Medium',
      color: '#ca8a04',
      bgColor: '#fef3c7',
      icon: '➡️',
    };
  } else if (score >= 20) {
    return {
      level: 'low',
      label: 'Low',
      color: '#2563eb',
      bgColor: '#dbeafe',
      icon: '⬇️',
    };
  } else {
    return {
      level: 'minimal',
      label: 'Minimal',
      color: '#64748b',
      bgColor: '#f1f5f9',
      icon: '○',
    };
  }
}

export default function PriorityBadge({ score, showLabel = true, size = 'medium' }: PriorityBadgeProps) {
  const category = getPriorityCategory(score);

  const sizes = {
    small: { padding: '2px 6px', fontSize: '10px', iconSize: '12px' },
    medium: { padding: '3px 8px', fontSize: '11px', iconSize: '14px' },
    large: { padding: '4px 10px', fontSize: '12px', iconSize: '16px' },
  };

  const sizeStyle = sizes[size];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: sizeStyle.padding,
        background: category.bgColor,
        color: category.color,
        borderRadius: '4px',
        fontSize: sizeStyle.fontSize,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
      title={`Priority Score: ${score}/100 (${category.label})`}
    >
      <span style={{ fontSize: sizeStyle.iconSize }}>{category.icon}</span>
      {showLabel && <span>{score}</span>}
    </span>
  );
}
