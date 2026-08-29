import { isRedisConnected, safeGet, safeSet, safeDel } from '../../config/redis.js'

const CACHE_TTL_SECONDS = 30 * 60 // 30 minutes
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000
const KEY_PREFIX = 'sce:'

// In-memory fallback for tests or when Redis is unavailable
const memoryFallback = new Map()

function clone(value) {
  return structuredClone(value)
}

function mergeAttributes(previous = {}, incoming = {}) {
  const merged = { ...previous }
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      if (value.length > 0) merged[key] = value
    } else if (value !== null && value !== undefined) {
      merged[key] = value
    }
  }
  return merged
}

export function mergeSCEState(previous, incoming) {
  if (!previous) return clone(incoming)

  const symptoms = new Map(previous.symptoms.map((symptom) => [symptom.symptomId, clone(symptom)]))
  for (const incomingSymptom of incoming.symptoms) {
    const existing = symptoms.get(incomingSymptom.symptomId)
    if (!existing) {
      symptoms.set(incomingSymptom.symptomId, clone(incomingSymptom))
      continue
    }

    symptoms.set(incomingSymptom.symptomId, {
      ...existing,
      ...incomingSymptom,
      role: existing.role === 'chief_complaint' && incomingSymptom.role !== 'chief_complaint'
        ? 'chief_complaint'
        : incomingSymptom.role || existing.role,
      attributes: mergeAttributes(existing.attributes, incomingSymptom.attributes),
    })
  }

  return {
    demographics: {
      age: incoming.demographics?.age ?? previous.demographics?.age ?? null,
      sex: incoming.demographics?.sex ?? previous.demographics?.sex ?? null,
    },
    temporal: {
      durationValue: incoming.temporal?.durationValue ?? previous.temporal?.durationValue ?? null,
      durationUnit: incoming.temporal?.durationUnit ?? previous.temporal?.durationUnit ?? null,
      onset: incoming.temporal?.onset ?? previous.temporal?.onset ?? null,
    },
    symptoms: [...symptoms.values()],
  }
}

function makeKey(conversationId) {
  return `${KEY_PREFIX}${conversationId}`
}

// ─── Redis-backed implementations ──────────────────────────────────────────

async function getFromRedis(conversationId) {
  const raw = await safeGet(makeKey(conversationId))
  if (!raw) return null
  return JSON.parse(raw)
}

async function setToRedis(conversationId, entry) {
  await safeSet(makeKey(conversationId), JSON.stringify(entry), CACHE_TTL_SECONDS)
}

// ─── In-memory fallback (used when Redis is disabled or unavailable) ──────

function getFromMemory(conversationId) {
  const entry = memoryFallback.get(conversationId)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memoryFallback.delete(conversationId)
    return null
  }
  return entry
}

function setToMemory(conversationId, entry) {
  entry.expiresAt = Date.now() + CACHE_TTL_MS
  memoryFallback.set(conversationId, entry)
}

export async function getSCEState(conversationId, userMessageCount) {
  if (!conversationId) return null

  let entry = null

  if (isRedisConnected()) {
    try {
      entry = await getFromRedis(conversationId)
    } catch (err) {
      console.warn(`[sceStateCache] Redis GET failed, falling back to memory: ${err.message}`)
      entry = getFromMemory(conversationId)
    }
  } else {
    entry = getFromMemory(conversationId)
  }

  if (!entry) return null
  if (entry.userMessageCount !== userMessageCount - 1) return null

  return clone(entry.sce)
}

export async function setSCEState(conversationId, userMessageCount, sce) {
  if (!conversationId) return

  const entry = {
    sce: clone(sce),
    userMessageCount,
    storedAt: Date.now(),
  }

  if (isRedisConnected()) {
    try {
      await setToRedis(conversationId, entry)
      return
    } catch (err) {
      console.warn(`[sceStateCache] Redis SET failed, falling back to memory: ${err.message}`)
    }
  }

  setToMemory(conversationId, entry)
}

export async function clearSCEState(conversationId) {
  if (!conversationId) return
  memoryFallback.delete(conversationId)
  if (isRedisConnected()) {
    await safeDel(makeKey(conversationId))
  }
}

// Kept for backward compatibility with existing tests
export function clearSCEStateCache() {
  memoryFallback.clear()
}