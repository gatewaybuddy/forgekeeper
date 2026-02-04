/**
 * Consciousness Monitor - Real-time consciousness system monitoring
 *
 * Displays:
 * - Current state and cycle information
 * - Recent thoughts and processing
 * - Memory status and consolidation
 * - Dreams and bias detection
 * - Values and attention focus
 *
 * Uses GraphQL subscriptions for real-time updates
 */

import React, { useState, useEffect } from 'react'
import { useQuery, useSubscription, gql } from '@apollo/client'

// GraphQL Queries
const GET_CONSCIOUSNESS_STATE = gql`
  query GetConsciousnessState {
    consciousnessState {
      state
      currentCycle
      cycleInterval
      shortTermMemory {
        id
        summary
        importance
      }
      apiTokensRemaining
      metrics {
        successRate
        avgCycleDuration
        uptimeMs
      }
    }
  }
`

// GraphQL Subscriptions
const CONSCIOUSNESS_STREAM = gql`
  subscription OnConsciousnessStream {
    consciousnessStream {
      type
      data
    }
  }
`

const CYCLE_COMPLETE = gql`
  subscription OnCycleComplete {
    cycleComplete {
      cycle
      duration
      success
      timestamp
    }
  }
`

const DREAM_COMPLETE = gql`
  subscription OnDreamComplete {
    dreamComplete {
      cycle
      memoriesConsolidated
      timestamp
    }
  }
`

interface ConsciousnessState {
  state: string
  currentCycle: number
  cycleInterval: number
  shortTermMemory: Array<{
    id: string
    summary: string
    importance: number
  }>
  apiTokensRemaining: number
  metrics: {
    successRate: number
    avgCycleDuration: number
    uptimeMs: number
  }
}

export const ConsciousnessMonitor: React.FC = () => {
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [lastCycle, setLastCycle] = useState<any>(null)
  const [lastDream, setLastDream] = useState<any>(null)

  // Query current state
  const { data, loading, error } = useQuery<{ consciousnessState: ConsciousnessState }>(
    GET_CONSCIOUSNESS_STATE,
    { pollInterval: 5000 } // Poll every 5 seconds as fallback
  )

  // Subscribe to consciousness stream
  useSubscription(CONSCIOUSNESS_STREAM, {
    onData: ({ data }) => {
      if (data?.data?.consciousnessStream) {
        setRecentEvents(prev => [
          ...prev.slice(-19),
          { ...data.data.consciousnessStream, timestamp: new Date().toISOString() }
        ])
      }
    }
  })

  // Subscribe to cycle completion
  useSubscription(CYCLE_COMPLETE, {
    onData: ({ data }) => {
      if (data?.data?.cycleComplete) {
        setLastCycle(data.data.cycleComplete)
      }
    }
  })

  // Subscribe to dream completion
  useSubscription(DREAM_COMPLETE, {
    onData: ({ data }) => {
      if (data?.data?.dreamComplete) {
        setLastDream(data.data.dreamComplete)
      }
    }
  })

  if (loading) {
    return <div className="consciousness-monitor loading">Loading consciousness state...</div>
  }

  if (error) {
    return <div className="consciousness-monitor error">Error: {error.message}</div>
  }

  const state = data?.consciousnessState

  if (!state) {
    return <div className="consciousness-monitor">No consciousness data available</div>
  }

  const uptimeHours = Math.floor(state.metrics.uptimeMs / (1000 * 60 * 60))
  const uptimeMinutes = Math.floor((state.metrics.uptimeMs % (1000 * 60 * 60)) / (1000 * 60))

  return (
    <div className="consciousness-monitor">
      <h2>Consciousness Monitor</h2>

      {/* Status Overview */}
      <div className="status-overview">
        <div className="status-card">
          <h3>State</h3>
          <div className={`state-indicator state-${state.state.toLowerCase()}`}>
            {state.state.toUpperCase()}
          </div>
        </div>

        <div className="status-card">
          <h3>Cycle</h3>
          <div className="cycle-info">
            <div className="cycle-number">{state.currentCycle}</div>
            <div className="cycle-interval">{state.cycleInterval / 1000}s interval</div>
          </div>
        </div>

        <div className="status-card">
          <h3>Success Rate</h3>
          <div className="success-rate">{state.metrics.successRate.toFixed(1)}%</div>
        </div>

        <div className="status-card">
          <h3>Uptime</h3>
          <div className="uptime">{uptimeHours}h {uptimeMinutes}m</div>
        </div>

        <div className="status-card">
          <h3>API Tokens</h3>
          <div className="tokens">
            {(state.apiTokensRemaining / 1000).toFixed(0)}k remaining
          </div>
        </div>
      </div>

      {/* Last Cycle Info */}
      {lastCycle && (
        <div className="last-cycle">
          <h3>Last Cycle</h3>
          <div className="cycle-details">
            <span>Cycle {lastCycle.cycle}</span>
            <span className={`status ${lastCycle.success ? 'success' : 'failed'}`}>
              {lastCycle.success ? '✓' : '✗'}
            </span>
            <span>{lastCycle.duration}ms</span>
            <span className="timestamp">{new Date(lastCycle.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Short-Term Memory */}
      <div className="short-term-memory">
        <h3>Short-Term Memory ({state.shortTermMemory.length}/5)</h3>
        <div className="memory-list">
          {state.shortTermMemory.map((memory) => (
            <div key={memory.id} className="memory-item">
              <div className="memory-summary">{memory.summary}</div>
              <div className="memory-importance">
                Importance: {(memory.importance * 100).toFixed(0)}%
              </div>
            </div>
          ))}
          {state.shortTermMemory.length === 0 && (
            <div className="empty-state">No memories in buffer</div>
          )}
        </div>
      </div>

      {/* Last Dream */}
      {lastDream && (
        <div className="last-dream">
          <h3>Last Dream</h3>
          <div className="dream-details">
            <span>Cycle {lastDream.cycle}</span>
            <span>{lastDream.memoriesConsolidated} memories consolidated</span>
            <span className="timestamp">{new Date(lastDream.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Recent Events */}
      <div className="recent-events">
        <h3>Recent Events</h3>
        <div className="event-list">
          {recentEvents.slice().reverse().map((event, i) => (
            <div key={i} className="event-item">
              <span className="event-type">{event.type}</span>
              <span className="event-timestamp">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {recentEvents.length === 0 && (
            <div className="empty-state">No recent events</div>
          )}
        </div>
      </div>

      <style jsx>{`
        .consciousness-monitor {
          padding: 20px;
          font-family: monospace;
        }

        .status-overview {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .status-card {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #ddd;
        }

        .status-card h3 {
          margin: 0 0 10px 0;
          font-size: 12px;
          text-transform: uppercase;
          color: #666;
        }

        .state-indicator {
          font-size: 18px;
          font-weight: bold;
          padding: 5px;
          border-radius: 4px;
        }

        .state-thinking {
          background: #e3f2fd;
          color: #1976d2;
        }

        .state-dreaming {
          background: #f3e5f5;
          color: #7b1fa2;
        }

        .state-idle {
          background: #fff3e0;
          color: #f57c00;
        }

        .state-stopped {
          background: #ffebee;
          color: #c62828;
        }

        .cycle-number {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }

        .cycle-interval,
        .success-rate,
        .uptime,
        .tokens {
          font-size: 14px;
          color: #666;
          margin-top: 5px;
        }

        .last-cycle,
        .last-dream,
        .short-term-memory,
        .recent-events {
          margin-bottom: 20px;
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .memory-list,
        .event-list {
          max-height: 200px;
          overflow-y: auto;
        }

        .memory-item {
          padding: 10px;
          background: white;
          border-radius: 4px;
          margin-bottom: 8px;
          border: 1px solid #e0e0e0;
        }

        .memory-summary {
          font-size: 13px;
          color: #333;
          margin-bottom: 5px;
        }

        .memory-importance {
          font-size: 11px;
          color: #666;
        }

        .event-item {
          display: flex;
          justify-content: space-between;
          padding: 8px;
          background: white;
          border-radius: 4px;
          margin-bottom: 5px;
          font-size: 12px;
        }

        .event-type {
          color: #333;
          font-weight: 500;
        }

        .event-timestamp {
          color: #999;
        }

        .cycle-details,
        .dream-details {
          display: flex;
          gap: 15px;
          font-size: 13px;
          color: #555;
        }

        .status.success {
          color: #4caf50;
          font-weight: bold;
        }

        .status.failed {
          color: #f44336;
          font-weight: bold;
        }

        .timestamp {
          color: #999;
          font-size: 11px;
        }

        .empty-state {
          text-align: center;
          color: #999;
          padding: 20px;
          font-size: 12px;
        }
      `}</style>
    </div>
  )
}
