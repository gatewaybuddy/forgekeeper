/**
 * @module consciousness/pattern-recognizer
 * @description Identifies recurring patterns across memories and experiences
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 85%
 *
 * Dependencies:
 * - None (standalone pattern detection)
 *
 * Integration points:
 * - Called by: DreamEngine during consolidation
 * - Analyzes: Memories, outcomes, events
 *
 * Tests:
 * - unit: __tests__/unit/pattern-recognizer.test.mjs
 */

/**
 * Pattern types
 */
const PATTERN_TYPES = {
  TEMPORAL: 'temporal',           // Time-based patterns
  SEQUENTIAL: 'sequential',       // Order-dependent patterns
  CAUSAL: 'causal',              // Cause-effect patterns
  THEMATIC: 'thematic',          // Topic/theme patterns
  BEHAVIORAL: 'behavioral',       // Behavior patterns
  CORRELATION: 'correlation'      // Correlated events
}

/**
 * PatternRecognizer - Identifies patterns across data
 */
export class PatternRecognizer {
  /**
   * Create pattern recognizer
   *
   * @param {object} options - Configuration
   * @param {number} options.minOccurrences - Min occurrences for pattern (default: 3)
   * @param {number} options.minConfidence - Min confidence threshold (default: 0.6)
   */
  constructor(options = {}) {
    this.minOccurrences = options.minOccurrences || 3
    this.minConfidence = options.minConfidence || 0.6

    this.recognizedPatterns = new Map()
    this.stats = {
      totalPatterns: 0,
      patternsByType: {}
    }
  }

  /**
   * Analyze memories for patterns
   *
   * @param {array} memories - Memories to analyze
   * @returns {array} Detected patterns
   */
  analyzeMemories(memories) {
    const patterns = []

    // Temporal patterns
    patterns.push(...this.detectTemporalPatterns(memories))

    // Sequential patterns
    patterns.push(...this.detectSequentialPatterns(memories))

    // Thematic patterns
    patterns.push(...this.detectThematicPatterns(memories))

    // Behavioral patterns
    patterns.push(...this.detectBehavioralPatterns(memories))

    // Filter by confidence
    const filteredPatterns = patterns.filter(p => p.confidence >= this.minConfidence)

    // Update recognized patterns
    for (const pattern of filteredPatterns) {
      this.recognizedPatterns.set(pattern.id, pattern)
    }

    this.updateStats()

    return filteredPatterns
  }

  /**
   * Detect temporal patterns (time-based)
   *
   * @param {array} memories - Memories
   * @returns {array} Patterns
   */
  detectTemporalPatterns(memories) {
    const patterns = []

    // Group by hour of day
    const hourlyGroups = {}
    for (const memory of memories) {
      const hour = new Date(memory.timestamp).getHours()
      if (!hourlyGroups[hour]) {
        hourlyGroups[hour] = []
      }
      hourlyGroups[hour].push(memory)
    }

    // Find hours with high activity
    for (const [hour, mems] of Object.entries(hourlyGroups)) {
      if (mems.length >= this.minOccurrences) {
        const avgImportance = mems.reduce((sum, m) => sum + (m.importance || 0.5), 0) / mems.length

        patterns.push({
          id: `temporal-hour-${hour}`,
          type: PATTERN_TYPES.TEMPORAL,
          description: `High activity around ${hour}:00`,
          occurrences: mems.length,
          confidence: Math.min(mems.length / 10, 0.9),
          metadata: {
            hour: parseInt(hour),
            avgImportance
          }
        })
      }
    }

    // Day of week patterns
    const dayGroups = {}
    for (const memory of memories) {
      const day = new Date(memory.timestamp).getDay()
      if (!dayGroups[day]) {
        dayGroups[day] = []
      }
      dayGroups[day].push(memory)
    }

    for (const [day, mems] of Object.entries(dayGroups)) {
      if (mems.length >= this.minOccurrences) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

        patterns.push({
          id: `temporal-day-${day}`,
          type: PATTERN_TYPES.TEMPORAL,
          description: `Higher activity on ${days[day]}`,
          occurrences: mems.length,
          confidence: Math.min(mems.length / 15, 0.8),
          metadata: {
            dayOfWeek: parseInt(day),
            dayName: days[day]
          }
        })
      }
    }

    return patterns
  }

  /**
   * Detect sequential patterns
   *
   * @param {array} memories - Memories (should be time-ordered)
   * @returns {array} Patterns
   */
  detectSequentialPatterns(memories) {
    const patterns = []
    const sequences = new Map()

    // Look for type sequences (A → B → C)
    for (let i = 0; i < memories.length - 2; i++) {
      const sequence = [
        memories[i].type || 'unknown',
        memories[i + 1].type || 'unknown',
        memories[i + 2].type || 'unknown'
      ].join(' → ')

      sequences.set(sequence, (sequences.get(sequence) || 0) + 1)
    }

    // Find common sequences
    for (const [sequence, count] of sequences.entries()) {
      if (count >= this.minOccurrences) {
        patterns.push({
          id: `sequential-${sequence.replace(/\s+/g, '-')}`,
          type: PATTERN_TYPES.SEQUENTIAL,
          description: `Common sequence: ${sequence}`,
          occurrences: count,
          confidence: Math.min(count / 5, 0.85),
          metadata: {
            sequence: sequence.split(' → ')
          }
        })
      }
    }

    return patterns
  }

  /**
   * Detect thematic patterns
   *
   * @param {array} memories - Memories
   * @returns {array} Patterns
   */
  detectThematicPatterns(memories) {
    const patterns = []

    // Extract keywords from memories
    const keywords = new Map()

    for (const memory of memories) {
      const text = [
        memory.content || '',
        memory.summary || '',
        memory.thought || ''
      ].join(' ').toLowerCase()

      const words = text.split(/\s+/)
        .filter(w => w.length > 4) // Filter short words

      for (const word of words) {
        keywords.set(word, (keywords.get(word) || 0) + 1)
      }
    }

    // Find recurring keywords
    const sortedKeywords = Array.from(keywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10 keywords

    for (const [keyword, count] of sortedKeywords) {
      if (count >= this.minOccurrences) {
        patterns.push({
          id: `thematic-${keyword}`,
          type: PATTERN_TYPES.THEMATIC,
          description: `Recurring theme: "${keyword}"`,
          occurrences: count,
          confidence: Math.min(count / memories.length, 0.9),
          metadata: {
            keyword,
            frequency: count / memories.length
          }
        })
      }
    }

    return patterns
  }

  /**
   * Detect behavioral patterns
   *
   * @param {array} memories - Memories
   * @returns {array} Patterns
   */
  detectBehavioralPatterns(memories) {
    const patterns = []

    // Success/failure patterns
    const outcomes = memories.filter(m => m.outcome)
    const successCount = outcomes.filter(m => m.outcome === 'success').length
    const failureCount = outcomes.filter(m => m.outcome === 'failure').length

    if (successCount >= this.minOccurrences) {
      patterns.push({
        id: 'behavioral-success-rate',
        type: PATTERN_TYPES.BEHAVIORAL,
        description: `Success rate: ${Math.round((successCount / outcomes.length) * 100)}%`,
        occurrences: successCount,
        confidence: 0.9,
        metadata: {
          successCount,
          totalOutcomes: outcomes.length,
          successRate: successCount / outcomes.length
        }
      })
    }

    // Tool usage patterns
    const toolUsage = new Map()
    for (const memory of memories) {
      const tools = memory.toolsUsed || memory.metadata?.toolsUsed || []
      for (const tool of tools) {
        toolUsage.set(tool, (toolUsage.get(tool) || 0) + 1)
      }
    }

    for (const [tool, count] of toolUsage.entries()) {
      if (count >= this.minOccurrences) {
        patterns.push({
          id: `behavioral-tool-${tool}`,
          type: PATTERN_TYPES.BEHAVIORAL,
          description: `Frequent use of ${tool}`,
          occurrences: count,
          confidence: Math.min(count / memories.length, 0.85),
          metadata: {
            tool,
            usageRate: count / memories.length
          }
        })
      }
    }

    return patterns
  }

  /**
   * Find correlations between events
   *
   * @param {array} events - Events to analyze
   * @returns {array} Correlation patterns
   */
  findCorrelations(events) {
    const patterns = []
    const correlations = new Map()

    // Look for events that happen together
    for (let i = 0; i < events.length - 1; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const timeDiff = Math.abs(
          new Date(events[j].timestamp).getTime() - new Date(events[i].timestamp).getTime()
        )

        // If events are within 1 hour
        if (timeDiff < 60 * 60 * 1000) {
          const key = `${events[i].type}+${events[j].type}`
          correlations.set(key, (correlations.get(key) || 0) + 1)
        }
      }
    }

    for (const [key, count] of correlations.entries()) {
      if (count >= this.minOccurrences) {
        const [type1, type2] = key.split('+')

        patterns.push({
          id: `correlation-${key.replace('+', '-')}`,
          type: PATTERN_TYPES.CORRELATION,
          description: `${type1} often followed by ${type2}`,
          occurrences: count,
          confidence: Math.min(count / 8, 0.8),
          metadata: {
            event1: type1,
            event2: type2
          }
        })
      }
    }

    return patterns
  }

  /**
   * Get pattern by ID
   *
   * @param {string} patternId - Pattern ID
   * @returns {object|null} Pattern
   */
  getPattern(patternId) {
    return this.recognizedPatterns.get(patternId) || null
  }

  /**
   * Get patterns by type
   *
   * @param {string} type - Pattern type
   * @returns {array} Patterns
   */
  getPatternsByType(type) {
    return Array.from(this.recognizedPatterns.values())
      .filter(p => p.type === type)
  }

  /**
   * Get all recognized patterns
   *
   * @param {object} filters - Filters
   * @returns {array} Patterns
   */
  getAllPatterns(filters = {}) {
    let patterns = Array.from(this.recognizedPatterns.values())

    if (filters.type) {
      patterns = patterns.filter(p => p.type === filters.type)
    }

    if (filters.minConfidence) {
      patterns = patterns.filter(p => p.confidence >= filters.minConfidence)
    }

    if (filters.minOccurrences) {
      patterns = patterns.filter(p => p.occurrences >= filters.minOccurrences)
    }

    // Sort by confidence
    patterns.sort((a, b) => b.confidence - a.confidence)

    return patterns
  }

  /**
   * Get pattern insights
   *
   * @returns {array} Insights
   */
  getInsights() {
    const insights = []
    const patterns = Array.from(this.recognizedPatterns.values())

    // Find strongest patterns
    const strongPatterns = patterns.filter(p => p.confidence > 0.8)
    if (strongPatterns.length > 0) {
      insights.push({
        type: 'strong-patterns',
        message: `${strongPatterns.length} strong patterns detected`,
        patterns: strongPatterns.slice(0, 3)
      })
    }

    // Find behavioral patterns
    const behavioral = patterns.filter(p => p.type === PATTERN_TYPES.BEHAVIORAL)
    if (behavioral.length > 0) {
      insights.push({
        type: 'behavior',
        message: `${behavioral.length} behavioral patterns identified`,
        patterns: behavioral
      })
    }

    // Find temporal patterns
    const temporal = patterns.filter(p => p.type === PATTERN_TYPES.TEMPORAL)
    if (temporal.length > 0) {
      insights.push({
        type: 'temporal',
        message: `Time-based patterns detected`,
        patterns: temporal
      })
    }

    return insights
  }

  /**
   * Update statistics
   */
  updateStats() {
    this.stats.totalPatterns = this.recognizedPatterns.size

    this.stats.patternsByType = {}
    for (const pattern of this.recognizedPatterns.values()) {
      const type = pattern.type
      this.stats.patternsByType[type] = (this.stats.patternsByType[type] || 0) + 1
    }
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    this.updateStats()
    return { ...this.stats }
  }

  /**
   * Clear all recognized patterns
   */
  clear() {
    this.recognizedPatterns.clear()
    this.stats = {
      totalPatterns: 0,
      patternsByType: {}
    }
  }
}
