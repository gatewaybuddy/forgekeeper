/**
 * @module consciousness/contextlog-analyzer
 * @description Analyzes ContextLog events to generate insights and thoughts
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 85%
 *
 * Dependencies:
 * - fs/promises (for reading JSONL files)
 *
 * Integration points:
 * - Called by: ThoughtGenerators.generateFromContextLog()
 * - Reads: .forgekeeper/context_log/*.jsonl
 *
 * Tests:
 * - unit: __tests__/unit/contextlog-analyzer.test.mjs
 */

import fs from 'fs/promises'
import path from 'path'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

/**
 * Pattern types detected in ContextLog
 */
const PATTERN_TYPES = {
  HIGH_CONTINUATION: 'high-continuation-rate',
  ERROR_SPIKE: 'error-spike',
  SLOW_RESPONSE: 'slow-response',
  TOOL_FAILURE: 'tool-failure',
  UNUSUAL_TIMING: 'unusual-timing',
  REPEATED_ERROR: 'repeated-error'
}

/**
 * ContextLogAnalyzer - Analyzes context logs for patterns and insights
 */
export class ContextLogAnalyzer {
  /**
   * Create ContextLog analyzer
   *
   * @param {object} options - Configuration
   * @param {string} options.contextLogDir - Directory containing context logs
   * @param {number} options.windowMinutes - Analysis window (default: 60)
   * @param {number} options.continuationThreshold - High continuation % (default: 0.15)
   * @param {number} options.errorThreshold - Error rate threshold (default: 0.10)
   */
  constructor(options = {}) {
    this.contextLogDir = options.contextLogDir || '.forgekeeper/context_log'
    this.windowMinutes = options.windowMinutes || 60
    this.continuationThreshold = options.continuationThreshold || 0.15
    this.errorThreshold = options.errorThreshold || 0.10

    // Cache
    this.recentEvents = []
    this.lastAnalysis = null
    this.patterns = []
  }

  /**
   * Analyze recent context log events
   *
   * @param {object} options - Analysis options
   * @param {number} options.limit - Max events to analyze
   * @returns {Promise<object>} Analysis result
   */
  async analyze(options = {}) {
    const limit = options.limit || 100

    // Read recent events
    const events = await this.readRecentEvents(limit)

    if (events.length === 0) {
      return {
        patterns: [],
        insights: [],
        events: 0,
        timestamp: new Date().toISOString()
      }
    }

    this.recentEvents = events

    // Detect patterns
    const patterns = [
      this.detectContinuationPattern(events),
      this.detectErrorSpike(events),
      this.detectSlowResponses(events),
      this.detectToolFailures(events),
      this.detectRepeatedErrors(events)
    ].filter(p => p !== null)

    this.patterns = patterns

    // Generate insights
    const insights = this.generateInsights(patterns, events)

    this.lastAnalysis = {
      patterns,
      insights,
      events: events.length,
      timestamp: new Date().toISOString()
    }

    return this.lastAnalysis
  }

  /**
   * Read recent events from context log
   *
   * @param {number} limit - Max events to read
   * @returns {Promise<array>} Recent events
   */
  async readRecentEvents(limit = 100) {
    try {
      // Find most recent log file
      const files = await fs.readdir(this.contextLogDir)
      const logFiles = files
        .filter(f => f.startsWith('ctx-') && f.endsWith('.jsonl'))
        .sort()
        .reverse()

      if (logFiles.length === 0) {
        return []
      }

      // Read from most recent file
      const mostRecent = path.join(this.contextLogDir, logFiles[0])
      const events = await this.tailEvents(mostRecent, limit)

      return events

    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[ContextLogAnalyzer] Failed to read events:', error)
      }
      return []
    }
  }

  /**
   * Tail events from JSONL file
   *
   * @param {string} filePath - File path
   * @param {number} limit - Max lines
   * @returns {Promise<array>} Events
   */
  async tailEvents(filePath, limit) {
    const events = []

    const fileStream = createReadStream(filePath)
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })

    for await (const line of rl) {
      if (!line.trim()) continue

      try {
        const event = JSON.parse(line)
        events.push(event)
      } catch (parseError) {
        // Skip invalid lines
      }
    }

    // Return last N events
    return events.slice(-limit)
  }

  /**
   * Detect high continuation rate pattern
   *
   * @param {array} events - Events to analyze
   * @returns {object|null} Pattern if detected
   */
  detectContinuationPattern(events) {
    const chatEvents = events.filter(e => e.name === 'chat_request')

    if (chatEvents.length < 5) return null

    const continuations = chatEvents.filter(e =>
      e.args_preview && e.args_preview.includes('continue')
    ).length

    const continuationRate = continuations / chatEvents.length

    if (continuationRate >= this.continuationThreshold) {
      return {
        type: PATTERN_TYPES.HIGH_CONTINUATION,
        severity: continuationRate > 0.3 ? 'high' : 'medium',
        confidence: 0.9,
        details: {
          continuationRate,
          totalRequests: chatEvents.length,
          continuations
        },
        message: `High continuation rate: ${Math.round(continuationRate * 100)}% (${continuations}/${chatEvents.length})`
      }
    }

    return null
  }

  /**
   * Detect error spike pattern
   *
   * @param {array} events - Events to analyze
   * @returns {object|null} Pattern if detected
   */
  detectErrorSpike(events) {
    const errorEvents = events.filter(e => e.status === 'error' || e.status === 'failed')

    if (events.length < 10) return null

    const errorRate = errorEvents.length / events.length

    if (errorRate >= this.errorThreshold) {
      // Find most common error
      const errorCounts = {}
      errorEvents.forEach(e => {
        const errorKey = e.name || 'unknown'
        errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1
      })

      const topError = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])[0]

      return {
        type: PATTERN_TYPES.ERROR_SPIKE,
        severity: errorRate > 0.2 ? 'high' : 'medium',
        confidence: 0.85,
        details: {
          errorRate,
          totalErrors: errorEvents.length,
          topError: topError ? topError[0] : 'unknown',
          topErrorCount: topError ? topError[1] : 0
        },
        message: `Error spike: ${Math.round(errorRate * 100)}% error rate, most common: ${topError ? topError[0] : 'unknown'}`
      }
    }

    return null
  }

  /**
   * Detect slow response pattern
   *
   * @param {array} events - Events to analyze
   * @returns {object|null} Pattern if detected
   */
  detectSlowResponses(events) {
    const completedEvents = events.filter(e => e.elapsed_ms > 0)

    if (completedEvents.length < 5) return null

    const avgDuration = completedEvents.reduce((sum, e) => sum + e.elapsed_ms, 0) / completedEvents.length
    const slowEvents = completedEvents.filter(e => e.elapsed_ms > avgDuration * 2)

    if (slowEvents.length >= 3) {
      return {
        type: PATTERN_TYPES.SLOW_RESPONSE,
        severity: 'medium',
        confidence: 0.75,
        details: {
          avgDuration: Math.round(avgDuration),
          slowEvents: slowEvents.length,
          slowestDuration: Math.max(...slowEvents.map(e => e.elapsed_ms))
        },
        message: `Slow responses detected: ${slowEvents.length} requests >2x avg (${Math.round(avgDuration)}ms)`
      }
    }

    return null
  }

  /**
   * Detect tool failure pattern
   *
   * @param {array} events - Events to analyze
   * @returns {object|null} Pattern if detected
   */
  detectToolFailures(events) {
    const toolEvents = events.filter(e => e.name && e.name.startsWith('tool_'))
    const toolFailures = toolEvents.filter(e => e.status === 'error' || e.status === 'failed')

    if (toolEvents.length < 5) return null

    const failureRate = toolFailures.length / toolEvents.length

    if (failureRate > 0.15) {
      // Find failing tool
      const failedTools = {}
      toolFailures.forEach(e => {
        const tool = e.name || 'unknown'
        failedTools[tool] = (failedTools[tool] || 0) + 1
      })

      const topFailure = Object.entries(failedTools)
        .sort((a, b) => b[1] - a[1])[0]

      return {
        type: PATTERN_TYPES.TOOL_FAILURE,
        severity: 'high',
        confidence: 0.8,
        details: {
          failureRate,
          totalToolCalls: toolEvents.length,
          failures: toolFailures.length,
          topFailure: topFailure ? topFailure[0] : 'unknown',
          topFailureCount: topFailure ? topFailure[1] : 0
        },
        message: `Tool failures: ${Math.round(failureRate * 100)}%, most failing: ${topFailure ? topFailure[0] : 'unknown'}`
      }
    }

    return null
  }

  /**
   * Detect repeated errors
   *
   * @param {array} events - Events to analyze
   * @returns {object|null} Pattern if detected
   */
  detectRepeatedErrors(events) {
    const errorEvents = events.filter(e => e.status === 'error' || e.status === 'failed')

    if (errorEvents.length < 3) return null

    // Group by error signature (name + args_preview)
    const errorGroups = {}
    errorEvents.forEach(e => {
      const signature = `${e.name}:${e.args_preview?.slice(0, 50) || ''}`
      errorGroups[signature] = (errorGroups[signature] || 0) + 1
    })

    // Find repeated errors (3+ times)
    const repeatedErrors = Object.entries(errorGroups)
      .filter(([sig, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])

    if (repeatedErrors.length > 0) {
      const [topSignature, count] = repeatedErrors[0]

      return {
        type: PATTERN_TYPES.REPEATED_ERROR,
        severity: 'high',
        confidence: 0.9,
        details: {
          repeatedErrors: repeatedErrors.length,
          topErrorSignature: topSignature,
          topErrorCount: count
        },
        message: `Repeated error: ${topSignature.split(':')[0]} failed ${count} times`
      }
    }

    return null
  }

  /**
   * Generate insights from detected patterns
   *
   * @param {array} patterns - Detected patterns
   * @param {array} events - Events analyzed
   * @returns {array} Insights
   */
  generateInsights(patterns, events) {
    const insights = []

    patterns.forEach(pattern => {
      switch (pattern.type) {
        case PATTERN_TYPES.HIGH_CONTINUATION:
          insights.push({
            thought: `Investigate high continuation rate (${Math.round(pattern.details.continuationRate * 100)}%) - responses may be incomplete`,
            priority: 'high',
            source: 'contextlog',
            expectedDuration: 'medium',
            context: pattern
          })
          break

        case PATTERN_TYPES.ERROR_SPIKE:
          insights.push({
            thought: `Error spike detected: ${pattern.details.topError} failing repeatedly`,
            priority: 'high',
            source: 'contextlog',
            expectedDuration: 'medium',
            context: pattern
          })
          break

        case PATTERN_TYPES.SLOW_RESPONSE:
          insights.push({
            thought: `Performance degradation: ${pattern.details.slowEvents} slow responses (avg ${pattern.details.avgDuration}ms)`,
            priority: 'medium',
            source: 'contextlog',
            expectedDuration: 'short',
            context: pattern
          })
          break

        case PATTERN_TYPES.TOOL_FAILURE:
          insights.push({
            thought: `Tool reliability issue: ${pattern.details.topFailure} failing ${Math.round(pattern.details.failureRate * 100)}% of the time`,
            priority: 'high',
            source: 'contextlog',
            expectedDuration: 'medium',
            context: pattern
          })
          break

        case PATTERN_TYPES.REPEATED_ERROR:
          insights.push({
            thought: `Systemic issue: ${pattern.details.topErrorSignature.split(':')[0]} failed ${pattern.details.topErrorCount} times`,
            priority: 'high',
            source: 'contextlog',
            expectedDuration: 'long',
            context: pattern
          })
          break
      }
    })

    return insights
  }

  /**
   * Get most important insight for thought generation
   *
   * @returns {object|null} Top insight
   */
  getMostImportantInsight() {
    if (!this.lastAnalysis || this.lastAnalysis.insights.length === 0) {
      return null
    }

    // Sort by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    const sorted = [...this.lastAnalysis.insights].sort((a, b) =>
      (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
    )

    return sorted[0]
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      lastAnalysis: this.lastAnalysis?.timestamp || null,
      recentEvents: this.recentEvents.length,
      patternsDetected: this.patterns.length,
      insights: this.lastAnalysis?.insights.length || 0
    }
  }
}
