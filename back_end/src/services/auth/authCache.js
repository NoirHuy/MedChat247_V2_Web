import crypto from 'node:crypto'
import { isRedisConnected, safeGet, safeSet, safeDel, safeExists } from '../../config/redis.js'

const KEY_PREFIX = 'auth:'
const SESSION_PREFIX = `${KEY_PREFIX}session:`
const BLACKLIST_PREFIX = `${KEY_PREFIX}revoked:`

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

// In-memory fallback
const memorySessions = new Map()
const memoryBlacklist = new Map()

function makeSessionKey(jti) {
  return `${SESSION_PREFIX}${jti}`
}

function makeBlacklistKey(jti) {
  return `${BLACKLIST_PREFIX}${jti}`
}

function makeFingerprint(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)
}

export function generateSessionId() {
  return crypto.randomBytes(24).toString('hex')
}

/**
 * Store a session in Redis for fast lookup across instances.
 * Falls back to in-memory map if Redis is unavailable.
 */
export async function storeSession(jti, sessionData, ttlSeconds = SESSION_TTL_SECONDS) {
  const payload = JSON.stringify({
    ...sessionData,
    createdAt: sessionData.createdAt || Date.now(),
  })

  if (isRedisConnected()) {
    try {
      await safeSet(makeSessionKey(jti), payload, ttlSeconds)
      return true
    } catch (err) {
      console.warn(`[authCache] storeSession Redis failed: ${err.message}`)
    }
  }

  const entry = memorySessions.get(jti) || {}
  entry.data = payload
  entry.expiresAt = Date.now() + ttlSeconds * 1000
  memorySessions.set(jti, entry)
  return true
}

export async function getSession(jti) {
  if (!jti) return null

  if (isRedisConnected()) {
    try {
      const raw = await safeGet(makeSessionKey(jti))
      if (raw) return JSON.parse(raw)
    } catch (err) {
      console.warn(`[authCache] getSession Redis failed: ${err.message}`)
    }
  }

  const entry = memorySessions.get(jti)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memorySessions.delete(jti)
    return null
  }
  return JSON.parse(entry.data)
}

export async function revokeSession(jti, ttlSeconds = SESSION_TTL_SECONDS) {
  if (!jti) return

  // Add to blacklist so any future requests with this jti are rejected
  if (isRedisConnected()) {
    try {
      await safeSet(makeBlacklistKey(jti), '1', ttlSeconds)
      await safeDel(makeSessionKey(jti))
      return
    } catch (err) {
      console.warn(`[authCache] revokeSession Redis failed: ${err.message}`)
    }
  }

  memoryBlacklist.set(jti, Date.now() + ttlSeconds * 1000)
  memorySessions.delete(jti)
}

export async function isSessionRevoked(jti) {
  if (!jti) return false

  if (isRedisConnected()) {
    try {
      const blacklisted = await safeExists(makeBlacklistKey(jti))
      if (blacklisted) return true
      // No blacklist entry => not revoked (the session may have simply expired
      // naturally; absence of both keys is treated as valid).
      return false
    } catch (err) {
      console.warn(`[authCache] isSessionRevoked Redis failed: ${err.message}`)
    }
  }

  const blacklistedUntil = memoryBlacklist.get(jti)
  if (blacklistedUntil) {
    if (blacklistedUntil > Date.now()) return true
    memoryBlacklist.delete(jti)
  }
  return false
}

/**
 * Revoke all sessions for a user (e.g. after password change).
 */
export async function revokeAllUserSessions(userId) {
  if (!userId) return 0

  if (isRedisConnected()) {
    try {
      // Scan for session keys; in production use SCAN to avoid blocking.
      // Here we use KEYS for simplicity since session count is bounded per user.
      const { getRedisClient } = await import('../../config/redis.js')
      const client = getRedisClient()
      const pattern = `${SESSION_PREFIX}*`
      const keys = await client.keys(pattern)
      let count = 0
      for (const key of keys) {
        try {
          const raw = await client.get(key)
          if (!raw) continue
          const data = JSON.parse(raw)
          if (data.userId === userId) {
            const jti = key.replace(SESSION_PREFIX, '')
            await revokeSession(jti)
            count++
          }
        } catch { /* Skip malformed entries */ }
      }
      return count
    } catch (err) {
      console.warn(`[authCache] revokeAllUserSessions Redis failed: ${err.message}`)
    }
  }

  let count = 0
  for (const [jti, entry] of memorySessions.entries()) {
    try {
      const data = JSON.parse(entry.data)
      if (data.userId === userId) {
        memorySessions.delete(jti)
        memoryBlacklist.set(jti, entry.expiresAt)
        count++
      }
    } catch {}
  }
  return count
}

/**
 * Test helper: clear all in-memory state.
 */
export function clearAuthCache() {
  memorySessions.clear()
  memoryBlacklist.clear()
}

export { makeFingerprint }