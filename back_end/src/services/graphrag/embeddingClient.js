import { env } from '../../config/env.js'
import { auditLog } from '../../utils/auditLog.js'
import { isRedisConnected, safeGet, safeSet } from '../../config/redis.js'

// ─── In-memory embedding cache (Layer 1, local to instance) ─────────────────
const _cache = new Map()

// ─── Redis config (Layer 2, shared across instances) ────────────────────────
const CACHE_TTL_SECONDS = 24 * 60 * 60 // 24 hours — embeddings are stable
const KEY_PREFIX = 'emb:'

function redisKey(normKey) {
  return `${KEY_PREFIX}${normKey}`
}

async function getFromRedis(normKey) {
  const raw = await safeGet(redisKey(normKey))
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Float32Array(arr)
  } catch {}
  return null
}

async function setToRedis(normKey, vec) {
  // Serialize Float32Array as regular array for JSON compatibility
  await safeSet(redisKey(normKey), JSON.stringify(Array.from(vec)), CACHE_TTL_SECONDS)
}

// ─── Cosine similarity between two vectors ────────────────────────────────────
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ─── Batch embed texts via OpenRouter Embeddings API ─────────────────────────
// Returns an array of Float32Array aligned 1:1 with the input texts array.
export async function getEmbeddings(texts) {
  if (!texts || texts.length === 0) return []
  if (!env.openrouterApiKey) {
    auditLog('EMBEDDING', 'Warning', 'OPENROUTER_API not configured — skipping embeddings.', 'warn')
    return texts.map(() => null)
  }

  const results = new Array(texts.length).fill(null)
  const uncachedIdx = []
  const uncachedTexts = []

  // Layer 1: RAM cache + Layer 2: Redis cache (per text)
  for (let i = 0; i < texts.length; i++) {
    const key = texts[i].toLowerCase().trim()

    // Layer 1: RAM cache hit (fastest)
    if (_cache.has(key)) {
      results[i] = _cache.get(key)
      continue
    }

    // Layer 2: Redis cache hit (shared across instances)
    if (isRedisConnected()) {
      try {
        const cachedVec = await getFromRedis(key)
        if (cachedVec) {
          _cache.set(key, cachedVec) // warm RAM cache
          results[i] = cachedVec
          continue
        }
      } catch (err) {
        auditLog('EMBEDDING', 'Warning', `Redis embedding cache miss: ${err.message}`, 'warn')
      }
    }

    uncachedIdx.push(i)
    uncachedTexts.push(texts[i])
  }

  if (uncachedTexts.length === 0) return results

  // Layer 3: Batch API call to OpenRouter /v1/embeddings
  const BATCH_SIZE = 50
  for (let b = 0; b < uncachedTexts.length; b += BATCH_SIZE) {
    const batch = uncachedTexts.slice(b, b + BATCH_SIZE)
    const batchIdx = uncachedIdx.slice(b, b + BATCH_SIZE)

    try {
      const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://medchat247.com',
          'X-Title': 'MedChat247 GraphRAG',
        },
        body: JSON.stringify({
          model: env.openrouterEmbeddingModel,
          input: batch,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`OpenRouter Embedding API ${res.status}: ${errText.slice(0, 200)}`)
      }

      const data = await res.json()
      const embeddings = data.data || []

      for (let i = 0; i < embeddings.length; i++) {
        const vec = new Float32Array(embeddings[i].embedding)
        const key = batch[i].toLowerCase().trim()
        // Save to both RAM and Redis caches
        _cache.set(key, vec)
        if (isRedisConnected()) {
          // Fire-and-forget to avoid blocking; failures are logged inside setToRedis
          setToRedis(key, vec).catch(() => {})
        }
        results[batchIdx[i]] = vec
      }
    } catch (err) {
      auditLog('EMBEDDING', 'Error', `Batch embedding failed: ${err.message}`, 'error')
      // Leave those indices as null — fallback to LLM will handle them
    }
  }

  return results
}

// ─── Single-text convenience wrapper ──────────────────────────────────────────
export async function getEmbedding(text) {
  const [vec] = await getEmbeddings([text])
  return vec ?? null
}