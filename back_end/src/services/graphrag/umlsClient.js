import { env } from '../../config/env.js'
import { auditLog } from '../../utils/auditLog.js'
import { isRedisConnected, safeGet, safeSet } from '../../config/redis.js'

// ─── 1. BUILT-IN COMMON CLINICAL SYMPTOM DICTIONARY (0ms LOOKUP) ────────────
const BUILTIN_UMLS_DICTIONARY = new Map([
  ['fever', [{ ui: 'C0015967', name: 'Fever' }]],
  ['cough', [{ ui: 'C0010200', name: 'Coughing' }]],
  ['coughing', [{ ui: 'C0010200', name: 'Coughing' }]],
  ['odynophagia', [{ ui: 'C0221150', name: 'Swallowing painful' }]],
  ['tonsillar erythema', [{ ui: 'C0241450', name: 'Tonsillar erythema' }]],
  ['globus sensation', [{ ui: 'C0017650', name: 'Globus Sensation' }]],
  ['fatigue', [{ ui: 'C0015672', name: 'Fatigue' }]],
  ['nasal congestion', [{ ui: 'C0027424', name: 'Nasal congestion (finding)' }]],
  ['rhinorrhea', [{ ui: 'C1260880', name: 'Rhinorrhea' }]],
  ['runny nose', [{ ui: 'C1260880', name: 'Rhinorrhea' }]],
  ['sore throat', [{ ui: 'C0242429', name: 'Sore Throat' }]],
  ['headache', [{ ui: 'C0018681', name: 'Headache' }]],
  ['abdominal pain', [{ ui: 'C0000737', name: 'Abdominal Pain' }]],
  ['chest pain', [{ ui: 'C0008031', name: 'Chest Pain' }]],
  ['dyspnea', [{ ui: 'C0013404', name: 'Dyspnea' }]],
  ['shortness of breath', [{ ui: 'C0013404', name: 'Dyspnea' }]],
  ['nausea', [{ ui: 'C0027497', name: 'Nausea' }]],
  ['vomiting', [{ ui: 'C0042963', name: 'Vomiting' }]],
  ['diarrhea', [{ ui: 'C0011991', name: 'Diarrhea' }]],
  ['rash', [{ ui: 'C0015230', name: 'Exanthema' }]],
  ['skin rash', [{ ui: 'C0015230', name: 'Exanthema' }]],
  ['arthralgia', [{ ui: 'C0003862', name: 'Arthralgia' }]],
  ['joint pain', [{ ui: 'C0003862', name: 'Arthralgia' }]],
  ['myalgia', [{ ui: 'C0231528', name: 'Myalgia' }]],
  ['muscle pain', [{ ui: 'C0231528', name: 'Myalgia' }]],
  ['chills', [{ ui: 'C0085593', name: 'Chills' }]],
  ['dizziness', [{ ui: 'C0012833', name: 'Dizziness' }]],
  ['loss of appetite', [{ ui: 'C0003123', name: 'Anorexia' }]],
  ['anorexia', [{ ui: 'C0003123', name: 'Anorexia' }]],
  ['sneezing', [{ ui: 'C0037383', name: 'Sneezing' }]],
  ['hoarseness', [{ ui: 'C0019825', name: 'Hoarseness' }]],
])

// ─── 2. IN-MEMORY LRU CACHE (RAM FALLBACK) ──────────────────────────────────
const umlsRamCache = new Map()
const RAM_CACHE_LIMIT = 2000

// ─── 3. REDIS CONFIG ───────────────────────────────────────────────────────
const CACHE_TTL_SECONDS = 2 * 60 * 60 // 2 hours - increased from 30 minutes for better cache hit rate
const KEY_PREFIX = 'umls:'

function redisKey(normKey) {
  return `${KEY_PREFIX}${normKey}`
}

async function getFromRedis(normKey) {
  const raw = await safeGet(redisKey(normKey))
  if (raw === null || raw === undefined) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function setToRedis(normKey, val) {
  await safeSet(redisKey(normKey), JSON.stringify(val), CACHE_TTL_SECONDS)
}

function getFromRamCache(key) {
  return umlsRamCache.get(key) || null
}

function setToRamCache(key, val) {
  if (umlsRamCache.size >= RAM_CACHE_LIMIT) {
    const firstKey = umlsRamCache.keys().next().value
    umlsRamCache.delete(firstKey)
  }
  umlsRamCache.set(key, val)
}

// ─── 4. SEARCH UMLS FUNCTION WITH MULTI-LAYER CACHING ──────────────────────
export async function searchUMLS(queryString, retries = 1, delay = 300) {
  if (!queryString || typeof queryString !== 'string') return []
  const normKey = queryString.trim().toLowerCase()

  // Layer 1: Check Built-in Dictionary (0ms)
  if (BUILTIN_UMLS_DICTIONARY.has(normKey)) {
    return BUILTIN_UMLS_DICTIONARY.get(normKey)
  }

  // Layer 2a: Check Redis (shared across instances)
  if (isRedisConnected()) {
    try {
      const cachedVal = await getFromRedis(normKey)
      if (cachedVal !== null) {
        // Warm RAM cache for subsequent calls on this instance
        setToRamCache(normKey, cachedVal)
        return cachedVal
      }
    } catch (err) {
      auditLog('UMLS', 'Warning', `Redis cache miss fallback: ${err.message}`, 'warn')
    }
  }

  // Layer 2b: Check RAM Cache (0ms, local to this instance)
  const cachedVal = getFromRamCache(normKey)
  if (cachedVal !== null) {
    return cachedVal
  }

  // If no UMLS_API_KEY config, return empty
  if (!env.umlsApiKey) {
    auditLog('UMLS', 'Info', 'No UMLS_API_KEY config. Skipping UMLS search.')
    setToRamCache(normKey, [])
    if (isRedisConnected()) {
      await setToRedis(normKey, [])
    }
    return []
  }

  // Layer 3: Network HTTP Request to NIH UMLS API (Fast timeout: 1.5s)
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const url = `https://uts-ws.nlm.nih.gov/rest/search/current?string=${encodeURIComponent(queryString)}&apiKey=${env.umlsApiKey}`
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (!response.ok) {
        throw new Error(`UMLS HTTP ${response.status}`)
      }
      const data = await response.json()
      const results = data.result?.results || []

      // Save to both caches
      setToRamCache(normKey, results)
      if (isRedisConnected()) {
        await setToRedis(normKey, results)
      }
      return results
    } catch (err) {
      const isLastAttempt = attempt === retries + 1
      if (isLastAttempt) {
        // Fallback to empty array and cache it to prevent repeated network hangs
        setToRamCache(normKey, [])
        if (isRedisConnected()) {
          await setToRedis(normKey, [])
        }
        return []
      }
      auditLog('UMLS', 'Warning', `UMLS "${queryString}" retry ${attempt}: ${err.message}`, 'warn')
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return []
}