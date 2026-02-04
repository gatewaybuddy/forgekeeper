/**
 * @module consciousness/auto-commit
 * @description Creates git save points as consciousness evolves
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 82%
 *
 * Dependencies:
 * - child_process (for git commands)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine every N cycles
 * - Creates: Git commits with consciousness state
 *
 * Tests:
 * - unit: __tests__/unit/auto-commit.test.mjs
 */

import { execSync } from 'child_process'
import fs from 'fs/promises'

/**
 * AutoCommit - Creates git save points automatically
 */
export class AutoCommit {
  /**
   * Create auto-commit manager
   *
   * @param {object} options - Configuration
   * @param {number} options.interval - Cycles between commits (default: 10)
   * @param {array} options.includePaths - Paths to include in commits
   */
  constructor(options = {}) {
    this.interval = options.interval || 10
    this.includePaths = options.includePaths || [
      '.forgekeeper/consciousness/',
      '.forgekeeper/memory/',
      '.forgekeeper/values.jsonl'
    ]

    this.commits = []
    this.lastCommit = null
    this.enabled = process.env.CONSCIOUSNESS_AUTO_COMMIT_ENABLED !== '0'
  }

  /**
   * Create a save point (git commit)
   *
   * @param {number} cycle - Current cycle number
   * @param {string} reason - Reason for save point
   * @returns {Promise<object>} Commit info
   */
  async createSavePoint(cycle, reason = 'autonomous') {
    if (!this.enabled) {
      console.log('[AutoCommit] Disabled, skipping')
      return null
    }

    try {
      // Check if we're in a git repo
      if (!await this.isGitRepo()) {
        console.warn('[AutoCommit] Not in a git repository')
        return null
      }

      // Detect changes
      const changes = await this.detectChanges()

      if (changes.length === 0) {
        console.log('[AutoCommit] No changes to commit')
        return null
      }

      // Generate commit message
      const message = await this.generateCommitMessage(cycle, reason, changes)

      // Create commit
      const commit = await this.gitCommit(changes, message)

      // Tag if milestone
      if (this.isMilestone(cycle)) {
        await this.gitTag(`consciousness-cycle-${cycle}`)
      }

      // Record
      const savePoint = {
        id: `save-${cycle}`,
        cycle,
        commitHash: commit.hash,
        message: commit.message,
        timestamp: new Date().toISOString(),
        filesChanged: changes,
        isMilestone: this.isMilestone(cycle),
        milestoneTag: this.isMilestone(cycle) ? `consciousness-cycle-${cycle}` : null
      }

      this.commits.push(savePoint)
      this.lastCommit = savePoint

      console.log(`[AutoCommit] Created save point: ${commit.hash.slice(0, 7)} (cycle ${cycle})`)

      return savePoint

    } catch (error) {
      console.error('[AutoCommit] Failed to create save point:', error)
      return null
    }
  }

  /**
   * Check if in git repository
   *
   * @returns {Promise<boolean>}
   */
  async isGitRepo() {
    try {
      execSync('git rev-parse --git-dir', {
        stdio: 'ignore',
        encoding: 'utf-8'
      })
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Detect changed files
   *
   * @returns {Promise<array>} List of changed files
   */
  async detectChanges() {
    const changed = []

    for (const includePath of this.includePaths) {
      try {
        // Check if path exists
        await fs.access(includePath)

        // Check git status for this path
        const status = execSync(`git status --porcelain "${includePath}"`, {
          encoding: 'utf-8'
        }).trim()

        if (status) {
          changed.push(includePath)
        }
      } catch (error) {
        // Path doesn't exist or error checking, skip
      }
    }

    return changed
  }

  /**
   * Generate commit message
   *
   * @param {number} cycle - Cycle number
   * @param {string} reason - Reason
   * @param {array} changes - Changed files
   * @returns {Promise<string>} Commit message
   */
  async generateCommitMessage(cycle, reason, changes) {
    const prefix = `cycle-${cycle}`

    // Simple message based on changes
    const changedAreas = []
    if (changes.some(c => c.includes('consciousness'))) {
      changedAreas.push('consciousness state')
    }
    if (changes.some(c => c.includes('memory'))) {
      changedAreas.push('memory')
    }
    if (changes.some(c => c.includes('values'))) {
      changedAreas.push('values/biases')
    }

    const description = changedAreas.length > 0
      ? `Updated ${changedAreas.join(', ')}`
      : 'State update'

    return `${prefix}: ${description}\n\n[autonomous-consciousness-${reason}]`
  }

  /**
   * Create git commit
   *
   * @param {array} files - Files to commit
   * @param {string} message - Commit message
   * @returns {Promise<object>} Commit info
   */
  async gitCommit(files, message) {
    // Add files
    for (const file of files) {
      execSync(`git add "${file}"`, { encoding: 'utf-8' })
    }

    // Commit
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8'
    })

    // Get commit hash
    const hash = execSync('git rev-parse HEAD', {
      encoding: 'utf-8'
    }).trim()

    return { hash, message }
  }

  /**
   * Create git tag
   *
   * @param {string} tagName - Tag name
   * @returns {Promise<void>}
   */
  async gitTag(tagName) {
    try {
      execSync(`git tag "${tagName}"`, { encoding: 'utf-8' })
      console.log(`[AutoCommit] Created tag: ${tagName}`)
    } catch (error) {
      console.warn(`[AutoCommit] Failed to create tag ${tagName}:`, error.message)
    }
  }

  /**
   * Check if cycle is a milestone
   *
   * @param {number} cycle - Cycle number
   * @returns {boolean}
   */
  isMilestone(cycle) {
    // Milestones: every 50 cycles
    return cycle % 50 === 0 && cycle > 0
  }

  /**
   * Get save points
   *
   * @param {object} options - Query options
   * @param {number} options.limit - Max results
   * @param {boolean} options.milestonesOnly - Only milestones
   * @returns {array} Save points
   */
  getSavePoints(options = {}) {
    let results = [...this.commits]

    if (options.milestonesOnly) {
      results = results.filter(sp => sp.isMilestone)
    }

    if (options.limit) {
      results = results.slice(-options.limit)
    }

    return results
  }

  /**
   * Get save point by ID
   *
   * @param {string} id - Save point ID
   * @returns {object|null} Save point
   */
  getSavePoint(id) {
    return this.commits.find(sp => sp.id === id) || null
  }

  /**
   * Restore from save point
   *
   * @param {string} commitHash - Commit hash to restore
   * @returns {Promise<void>}
   */
  async restoreFromSavePoint(commitHash) {
    if (!this.enabled) {
      throw new Error('AutoCommit is disabled')
    }

    console.log(`[AutoCommit] Restoring from ${commitHash}...`)

    // Checkout specific paths from commit
    for (const includePath of this.includePaths) {
      try {
        execSync(`git checkout ${commitHash} -- "${includePath}"`, {
          encoding: 'utf-8'
        })
      } catch (error) {
        console.warn(`[AutoCommit] Failed to restore ${includePath}:`, error.message)
      }
    }

    console.log('[AutoCommit] Restore complete')
  }

  /**
   * Get commit statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      totalCommits: this.commits.length,
      milestones: this.commits.filter(c => c.isMilestone).length,
      lastCommit: this.lastCommit,
      enabled: this.enabled,
      interval: this.interval
    }
  }
}
