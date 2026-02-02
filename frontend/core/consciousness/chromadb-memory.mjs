/**
 * @module consciousness/chromadb-memory
 * @description ChromaDB integration for semantic episodic memory
 *
 * Provides vector-based semantic search for consciousness memories.
 * Stores episodic memories with embeddings for similarity retrieval.
 *
 * @status IMPLEMENTED
 * @tested false
 *
 * Dependencies:
 * - ChromaDB server (Docker container)
 * - chromadb npm package (HTTP client)
 *
 * Environment:
 * - CHROMADB_URL: ChromaDB server URL (default: http://localhost:8000)
 * - CHROMADB_COLLECTION: Collection name (default: consciousness-memories)
 */

import { ChromaClient } from 'chromadb'

/**
 * ChromaDBMemory - Semantic memory storage with vector embeddings
 */
export class ChromaDBMemory {
  /**
   * Create ChromaDB memory manager
   *
   * @param {object} options - Configuration options
   * @param {string} options.url - ChromaDB server URL
   * @param {string} options.collectionName - Collection name
   * @param {object} options.embeddingFunction - Embedding function (optional)
   */
  constructor(options = {}) {
    this.url = options.url || process.env.CHROMADB_URL || 'http://localhost:8000'
    this.collectionName = options.collectionName ||
      process.env.CHROMADB_COLLECTION ||
      'consciousness-memories'

    this.client = null
    this.collection = null
    this.embeddingFunction = options.embeddingFunction
    this.initialized = false
  }

  /**
   * Initialize ChromaDB connection and collection
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Create ChromaDB client
      this.client = new ChromaClient({
        path: this.url
      })

      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.collectionName,
          embeddingFunction: this.embeddingFunction
        })
        console.log(`[ChromaDB] Connected to existing collection: ${this.collectionName}`)
      } catch (error) {
        // Collection doesn't exist, create it
        this.collection = await this.client.createCollection({
          name: this.collectionName,
          embeddingFunction: this.embeddingFunction,
          metadata: {
            description: 'Consciousness episodic memories',
            createdAt: new Date().toISOString()
          }
        })
        console.log(`[ChromaDB] Created new collection: ${this.collectionName}`)
      }

      this.initialized = true
      console.log(`[ChromaDB] Initialized successfully`)
    } catch (error) {
      console.error('[ChromaDB] Initialization failed:', error)
      console.warn('[ChromaDB] Falling back to in-memory mode')
      this.initialized = false
    }
  }

  /**
   * Add a memory to ChromaDB
   *
   * @param {object} memory - Memory to add
   * @returns {Promise<object>} Added memory
   */
  async add(memory) {
    if (!this.initialized) {
      console.warn('[ChromaDB] Not initialized, skipping add')
      return memory
    }

    try {
      const id = memory.id || `mem-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Prepare document and metadata
      const document = memory.summary || memory.description || JSON.stringify(memory)
      const metadata = {
        type: memory.type || 'EPISODIC',
        importance: memory.importance || 0.5,
        salience: memory.salience || 0.5,
        timestamp: memory.timestamp || new Date().toISOString(),
        cycleId: memory.cycleId || null,
        tags: JSON.stringify(memory.tags || []),
        // Store full memory as JSON (for retrieval)
        fullMemory: JSON.stringify(memory)
      }

      // Add to collection
      await this.collection.add({
        ids: [id],
        documents: [document],
        metadatas: [metadata]
      })

      console.log(`[ChromaDB] Added memory: ${id}`)

      return {
        ...memory,
        id,
        chromaId: id
      }
    } catch (error) {
      console.error('[ChromaDB] Add failed:', error)
      return memory
    }
  }

  /**
   * Search for similar memories
   *
   * @param {string} query - Search query text
   * @param {object} options - Search options
   * @param {number} options.limit - Max results (default: 5)
   * @param {object} options.filter - Metadata filter
   * @returns {Promise<array>} Similar memories
   */
  async search(query, options = {}) {
    if (!this.initialized) {
      console.warn('[ChromaDB] Not initialized, returning empty results')
      return []
    }

    try {
      const limit = options.limit || 5
      const filter = options.filter || {}

      // Query ChromaDB
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: limit,
        where: filter
      })

      // Parse and return results
      const memories = []
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const metadata = results.metadatas[0][i]
          const distance = results.distances[0][i]

          // Parse full memory from metadata
          let memory = {}
          try {
            memory = JSON.parse(metadata.fullMemory || '{}')
          } catch (e) {
            memory = {
              summary: results.documents[0][i],
              ...metadata
            }
          }

          memories.push({
            ...memory,
            _chromaId: results.ids[0][i],
            _distance: distance,
            _similarity: 1 - distance // Convert distance to similarity
          })
        }
      }

      console.log(`[ChromaDB] Search for "${query}" returned ${memories.length} results`)

      return memories
    } catch (error) {
      console.error('[ChromaDB] Search failed:', error)
      return []
    }
  }

  /**
   * Get memory by ID
   *
   * @param {string} id - Memory ID
   * @returns {Promise<object|null>} Memory or null
   */
  async get(id) {
    if (!this.initialized) {
      console.warn('[ChromaDB] Not initialized')
      return null
    }

    try {
      const results = await this.collection.get({
        ids: [id]
      })

      if (results.documents && results.documents[0]) {
        const metadata = results.metadatas[0]

        // Parse full memory
        let memory = {}
        try {
          memory = JSON.parse(metadata.fullMemory || '{}')
        } catch (e) {
          memory = {
            summary: results.documents[0],
            ...metadata
          }
        }

        return {
          ...memory,
          _chromaId: results.ids[0]
        }
      }

      return null
    } catch (error) {
      console.error('[ChromaDB] Get failed:', error)
      return null
    }
  }

  /**
   * Delete memory by ID
   *
   * @param {string} id - Memory ID
   * @returns {Promise<boolean>} Success
   */
  async delete(id) {
    if (!this.initialized) {
      console.warn('[ChromaDB] Not initialized')
      return false
    }

    try {
      await this.collection.delete({
        ids: [id]
      })

      console.log(`[ChromaDB] Deleted memory: ${id}`)
      return true
    } catch (error) {
      console.error('[ChromaDB] Delete failed:', error)
      return false
    }
  }

  /**
   * Count total memories
   *
   * @returns {Promise<number>} Count
   */
  async count() {
    if (!this.initialized) {
      return 0
    }

    try {
      const count = await this.collection.count()
      return count
    } catch (error) {
      console.error('[ChromaDB] Count failed:', error)
      return 0
    }
  }

  /**
   * Get collection stats
   *
   * @returns {Promise<object>} Stats
   */
  async getStats() {
    if (!this.initialized) {
      return {
        initialized: false,
        count: 0
      }
    }

    try {
      const count = await this.count()

      return {
        initialized: true,
        count,
        collectionName: this.collectionName,
        url: this.url
      }
    } catch (error) {
      console.error('[ChromaDB] Stats failed:', error)
      return {
        initialized: false,
        count: 0,
        error: error.message
      }
    }
  }

  /**
   * Clear all memories (use with caution!)
   *
   * @returns {Promise<boolean>} Success
   */
  async clear() {
    if (!this.initialized) {
      return false
    }

    try {
      await this.client.deleteCollection({
        name: this.collectionName
      })

      // Recreate collection
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingFunction
      })

      console.log(`[ChromaDB] Cleared collection: ${this.collectionName}`)
      return true
    } catch (error) {
      console.error('[ChromaDB] Clear failed:', error)
      return false
    }
  }

  /**
   * Health check
   *
   * @returns {Promise<boolean>} Is healthy
   */
  async healthCheck() {
    try {
      if (!this.client) {
        return false
      }

      // Try to list collections
      await this.client.listCollections()
      return true
    } catch (error) {
      console.error('[ChromaDB] Health check failed:', error)
      return false
    }
  }
}
