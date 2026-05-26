import type { ContentChunk } from '@/lib/chunking';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RankedChunk = {
  chunk: ContentChunk;
  relevanceScore: number;
  cosineSimilarity: number;
};

export type TfIdfCorpus = {
  idf: Map<string, number>;
  chunkVectors: Map<string, Map<string, number>>;
};

// ---------------------------------------------------------------------------
// Stop-words list (~50 common English words)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'it', 'its', 'this', 'that', 'these', 'those', 'they', 'them', 'their',
  'he', 'she', 'we', 'you', 'his', 'her', 'our', 'your', 'my', 'can',
  'not', 'no', 'so', 'if', 'as', 'than', 'then', 'what', 'which', 'who',
]);

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * Lowercase, strip punctuation, split on whitespace, filter stop-words and
 * short tokens (≤2 chars).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

// ---------------------------------------------------------------------------
// TF-IDF corpus construction
// ---------------------------------------------------------------------------

/**
 * Build a TF-IDF corpus from an array of content chunks.
 *
 * TF  = normalized term frequency: count(term) / max_count_in_doc
 * IDF = log((N+1)/(df+1)) + 1  (Scikit-learn–style smooth IDF)
 */
export function buildTfIdfCorpus(chunks: ContentChunk[]): TfIdfCorpus {
  const N = chunks.length;

  // Step 1: compute raw term frequencies per chunk and document frequency
  const rawTf = new Map<string, Map<string, number>>();   // chunkId → term → count
  const df   = new Map<string, number>();                 // term → number of chunks containing it

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const termCounts = new Map<string, number>();
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
    }
    rawTf.set(chunk.id, termCounts);

    for (const term of termCounts.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  // Step 2: compute IDF for every term
  const idf = new Map<string, number>();
  for (const [term, docFreq] of df) {
    idf.set(term, Math.log((N + 1) / (docFreq + 1)) + 1);
  }

  // Step 3: compute normalized TF × IDF vectors per chunk
  const chunkVectors = new Map<string, Map<string, number>>();
  for (const chunk of chunks) {
    const termCounts = rawTf.get(chunk.id)!;
    const maxCount = Math.max(...termCounts.values(), 1);
    const vector = new Map<string, number>();
    for (const [term, count] of termCounts) {
      const tf = count / maxCount;                        // normalized TF
      const idfVal = idf.get(term) ?? 1;
      vector.set(term, tf * idfVal);
    }
    chunkVectors.set(chunk.id, vector);
  }

  return { idf, chunkVectors };
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  if (vecA.size === 0 || vecB.size === 0) return 0;

  let dot = 0;
  for (const [term, weightA] of vecA) {
    const weightB = vecB.get(term) ?? 0;
    dot += weightA * weightB;
  }

  const normA = Math.sqrt([...vecA.values()].reduce((sum, w) => sum + w * w, 0));
  const normB = Math.sqrt([...vecB.values()].reduce((sum, w) => sum + w * w, 0));

  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

// ---------------------------------------------------------------------------
// Score a single chunk against a pre-built corpus + query token vector
// ---------------------------------------------------------------------------

/**
 * Build a TF-IDF query vector using the corpus IDF, then return cosine
 * similarity between the chunk vector and the query vector.
 */
export function scoreChunkRelevance(
  chunk: ContentChunk,
  corpus: TfIdfCorpus,
  queryTokens: string[]
): number {
  const chunkVec = corpus.chunkVectors.get(chunk.id);
  if (!chunkVec || queryTokens.length === 0) return 0;

  // Build query TF vector (uniform raw count = 1 per unique token)
  const queryCounts = new Map<string, number>();
  for (const token of queryTokens) {
    queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
  }
  const queryMaxCount = Math.max(...queryCounts.values(), 1);

  const queryVec = new Map<string, number>();
  for (const [term, count] of queryCounts) {
    const tf     = count / queryMaxCount;
    const idfVal = corpus.idf.get(term) ?? (Math.log((corpus.chunkVectors.size + 1) / 1) + 1);
    queryVec.set(term, tf * idfVal);
  }

  return cosineSimilarity(chunkVec, queryVec);
}

// ---------------------------------------------------------------------------
// Main ranking function
// ---------------------------------------------------------------------------

/**
 * Rank chunks by relevance to a free-text query using TF-IDF cosine similarity
 * combined with the chunk's own quality score.
 *
 * relevanceScore = 0.65 × cosine + 0.35 × (chunk.score / maxChunkScore)
 *
 * Falls back to ranking by chunk.score when the query is empty.
 */
export function rankChunksByRelevance(
  chunks: ContentChunk[],
  query: string,
  topK?: number
): RankedChunk[] {
  if (chunks.length === 0) return [];

  const maxChunkScore = Math.max(...chunks.map((c) => c.score), 1);
  const queryTrimmed  = query.trim();

  // --- Empty query fallback ---
  if (!queryTrimmed) {
    const ranked: RankedChunk[] = chunks
      .map((chunk) => ({
        chunk,
        relevanceScore: chunk.score / maxChunkScore,
        cosineSimilarity: 0,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    return topK !== undefined ? ranked.slice(0, topK) : ranked;
  }

  // --- Build corpus and query tokens ---
  const corpus      = buildTfIdfCorpus(chunks);
  const queryTokens = tokenize(queryTrimmed);

  const ranked: RankedChunk[] = chunks.map((chunk) => {
    const cosine       = scoreChunkRelevance(chunk, corpus, queryTokens);
    const normalizedQS = chunk.score / maxChunkScore;
    const relevanceScore = Math.min(1, 0.65 * cosine + 0.35 * normalizedQS);
    return { chunk, relevanceScore, cosineSimilarity: cosine };
  });

  ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return topK !== undefined ? ranked.slice(0, topK) : ranked;
}

// ---------------------------------------------------------------------------
// Post-ranking filter
// ---------------------------------------------------------------------------

/**
 * Keep only chunks whose relevanceScore exceeds minRelevance (default 0.05).
 * Always returns at least one chunk (the highest scoring) to avoid empty sets.
 */
export function filterTopChunks(
  rankedChunks: RankedChunk[],
  minRelevance = 0.05
): RankedChunk[] {
  if (rankedChunks.length === 0) return [];
  const filtered = rankedChunks.filter((r) => r.relevanceScore > minRelevance);
  // Guarantee at least one result so downstream code always has something to use
  return filtered.length > 0 ? filtered : [rankedChunks[0]];
}
