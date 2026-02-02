/**
 * Simple TF-IDF embeddings for semantic similarity
 * Lightweight alternative to vector databases
 */
import { logger } from '../utils/logger.js';

// Stop words to ignore
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'this', 'but', 'they', 'have', 'had',
  'what', 'when', 'where', 'who', 'which', 'why', 'how',
]);

/**
 * Tokenize and normalize text
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Extract keywords from text
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  const tokens = tokenize(text);
  const frequency = new Map<string, number>();

  // Count frequencies
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }

  // Sort by frequency
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * TF-IDF vectorizer
 */
export class TFIDFVectorizer {
  private vocabulary: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private numDocuments: number = 0;

  /**
   * Fit the vectorizer on a corpus of documents
   */
  fit(documents: string[]): void {
    this.numDocuments = documents.length;
    const allTokens = new Set<string>();

    // Build vocabulary and document frequency
    for (const doc of documents) {
      const tokens = new Set(tokenize(doc));

      for (const token of tokens) {
        allTokens.add(token);
        this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
      }
    }

    // Build vocabulary index
    let idx = 0;
    for (const token of allTokens) {
      this.vocabulary.set(token, idx++);
    }

    logger.debug(
      { vocabularySize: this.vocabulary.size, documents: this.numDocuments },
      'TF-IDF vectorizer fitted'
    );
  }

  /**
   * Transform a document into a TF-IDF vector
   */
  transform(document: string): number[] {
    const vector = new Array(this.vocabulary.size).fill(0);
    const tokens = tokenize(document);

    // Calculate term frequency
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Calculate TF-IDF for each term
    for (const [token, freq] of tf.entries()) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) {
        const termFreq = freq / tokens.length;
        const docFreq = this.documentFrequency.get(token) || 1;
        const idf = Math.log(this.numDocuments / docFreq);
        vector[idx] = termFreq * idf;
      }
    }

    return vector;
  }

  /**
   * Fit and transform in one step
   */
  fitTransform(documents: string[]): number[][] {
    this.fit(documents);
    return documents.map((doc) => this.transform(doc));
  }

  /**
   * Get vocabulary size
   */
  getVocabularySize(): number {
    return this.vocabulary.size;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Find most similar vectors
 */
export function findSimilar(
  queryVector: number[],
  vectors: Array<{ vector: number[]; data: any }>,
  limit: number = 5,
  minSimilarity: number = 0.1
): Array<{ data: any; similarity: number }> {
  const similarities = vectors
    .map((item) => ({
      data: item.data,
      similarity: cosineSimilarity(queryVector, item.vector),
    }))
    .filter((item) => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, limit);
}
