import { isRedisConnected, safeIncr, safeDecr, safeDel, safeTTL } from '../config/redis.js'

const KEY_PREFIX = 'rl:'

// Prune the in-memory fallback once it grows past this many keys so long
// uptimes without Redis cannot leak unbounded memory.
const MEMORY_PRUNE_THRESHOLD = 10_000

/**
 * Store for express-rate-limit that prefers Redis and transparently falls back
 * to a per-process in-memory Map while Redis is unavailable.
 *
 * The Redis-vs-memory decision is made per request, not at construction time:
 * limiters are built during module load — before connectRedis() resolves — so
 * deciding there would permanently bind them to memory even when Redis is up.
 */
export function createRedisStore(windowMs) {
  const memoryHits = new Map()

  function pruneExpiredMemoryEntries(now) {
    if (memoryHits.size < MEMORY_PRUNE_THRESHOLD) return
    for (const [key, entry] of memoryHits) {
      if (now >= entry.resetTime) memoryHits.delete(key)
    }
  }

  function incrementMemory(key) {
    const now = Date.now()
    pruneExpiredMemoryEntries(now)
    const entry = memoryHits.get(key)
    if (!entry || now >= entry.resetTime.getTime()) {
      const resetTime = new Date(now + windowMs)
      memoryHits.set(key, { totalHits: 1, resetTime })
      return { totalHits: 1, resetTime }
    }
    entry.totalHits += 1
    return { totalHits: entry.totalHits, resetTime: entry.resetTime }
  }

  return {
    async increment(key) {
      const fullKey = `${KEY_PREFIX}${key}`
      if (isRedisConnected()) {
        const count = await safeIncr(fullKey, Math.ceil(windowMs / 1000))
        if (count !== null) {
          const ttl = await safeTTL(fullKey)
          const resetTime = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + windowMs)
          return { totalHits: count, resetTime }
        }
      }
      // Redis unavailable: keep enforcing the limit locally instead of
      // disabling it entirely (fail-closed per instance).
      return incrementMemory(key)
    },

    async decrement(key) {
      const entry = memoryHits.get(key)
      if (entry && entry.totalHits > 0) entry.totalHits -= 1
      if (isRedisConnected()) {
        await safeDecr(`${KEY_PREFIX}${key}`)
      }
    },

    async resetKey(key) {
      memoryHits.delete(key)
      if (isRedisConnected()) {
        await safeDel(`${KEY_PREFIX}${key}`)
      }
    },

    async resetAll() {
      memoryHits.clear()
      // Bulk delete via KEYS can block Redis; skip on purpose.
    },
  }
}
