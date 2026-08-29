/**
 * symptomVectorIndex.js
 *
 * Builds and queries an in-memory vector index of all SymCAT symptoms
 * loaded from Neo4j. Used for deterministic, similarity-based symptom
 * matching — replacing non-deterministic LLM Fallback for known medical terms.
 *
 * Lifecycle:
 *   1. Call initSymptomVectorIndex(symptomsList) once on backend startup.
 *   2. Call vectorSearchSymptom(queryText) for each unmatched term at query time.
 */

import { env } from '../../config/env.js'
import { auditLog } from '../../utils/auditLog.js'
import { getEmbeddings, getEmbedding, cosineSimilarity } from './embeddingClient.js'

// ─── Module-level singleton index ─────────────────────────────────────────────
let _index = []      // [{ id, name, cui, embedding: Float32Array }]
let _initialized = false
let _initPromise = null

// ─── Build the symptom vector index on startup ────────────────────────────────
export async function initSymptomVectorIndex(symptomsList) {
  if (_initialized) return
  // Prevent concurrent re-initialization
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    if (!env.openrouterApiKey) {
      auditLog('VECTOR_INDEX', 'Warning', 'OPENROUTER_API not set — vector index disabled.', 'warn')
      _initialized = true
      return
    }

    auditLog('VECTOR_INDEX', 'Init', `Building symptom vector index for ${symptomsList.length} symptoms...`)
    const startMs = Date.now()

    // Build query strings: "name: {name}. description: {description}"
    const texts = symptomsList.map(s =>
      s.description
        ? `${s.name}. ${s.description.slice(0, 200)}`
        : s.name
    )

    let embeddings
    try {
      embeddings = await getEmbeddings(texts)
    } catch (err) {
      auditLog('VECTOR_INDEX', 'Error', `Failed to build index: ${err.message}`, 'error')
      _initPromise = null
      throw err
    }

    _index = symptomsList
      .map((s, i) => ({
        id: s.id,
        name: s.name,
        cui: s.cui || null,
        embedding: embeddings[i],
      }))
      .filter(entry => entry.embedding !== null)

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
    auditLog('VECTOR_INDEX', 'Init', `Built symptom vector index for ${_index.length} symptoms in ${elapsed}s`)
    _initialized = true
  })()

  return _initPromise
}

// ─── Query: find best-matching symptom for a query string ─────────────────────
// Returns { symptom: { id, name, cui }, similarity } or null if below threshold.
export async function vectorSearchSymptom(queryText) {
  if (!_initialized || _index.length === 0) return null

  const queryVec = await getEmbedding(queryText)
  if (!queryVec) return null

  let bestSim = -1
  let bestEntry = null

  for (const entry of _index) {
    if (!entry.embedding) continue
    const sim = cosineSimilarity(queryVec, entry.embedding)
    if (sim > bestSim) {
      bestSim = sim
      bestEntry = entry
    }
  }

  const threshold = env.embeddingSimilarityThreshold
  if (bestEntry && bestSim >= threshold) {
    return { symptom: bestEntry, similarity: bestSim }
  }

  return null
}

// ─── Status helpers ───────────────────────────────────────────────────────────
export function isVectorIndexReady() {
  return _initialized && _index.length > 0
}

export function getVectorIndexSize() {
  return _index.length
}
