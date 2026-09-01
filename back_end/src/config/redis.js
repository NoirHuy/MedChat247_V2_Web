import { createClient } from 'redis'
import { env } from './env.js'
import { auditLog } from '../utils/auditLog.js'

const REDIS_ENABLED = env.redisEnabled

// Never log the raw URL — REDIS_URL may embed credentials.
function redactedUrl(url) {
  return String(url || '').replace(/:\/\/([^:@/]+):[^@/]*@/, '://$1:***@')
}

const redisConfig = {
  url: env.redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[redis] Max reconnection attempts reached. Falling back to in-memory cache.')
        return new Error('Max retries exceeded')
      }
      return Math.min(retries * 100, 3000)
    },
    connectTimeout: 5000,
  },
  password: process.env.REDIS_PASSWORD || undefined,
}

const client = createClient(redisConfig)

let isConnected = false
let connectionPromise = null

// ─── Cache Performance Metrics ─────────────────────────────────────────────
const metrics = {
  hits: 0,
  misses: 0,
  errors: 0,
  connectionAttempts: 0,
  connectionFailures: 0,
  lastHealthCheck: null,
  startTime: Date.now()
}

export function getRedisMetrics() {
  const totalRequests = metrics.hits + metrics.misses
  const hitRate = totalRequests > 0 ? (metrics.hits / totalRequests * 100).toFixed(2) : 0
  return {
    ...metrics,
    totalRequests,
    hitRate: `${hitRate}%`,
    uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
    isConnected
  }
}

client.on('error', (err) => {
  metrics.errors++
  if (isConnected) {
    auditLog('REDIS', 'Error', `Redis client error: ${err.message}`, 'error')
  }
})

client.on('connect', () => {
  console.log('[redis] Connected to Redis server.')
  isConnected = true
})

client.on('disconnect', () => {
  console.warn('[redis] Disconnected from Redis server.')
  isConnected = false
})

client.on('reconnecting', () => {
  console.warn('[redis] Reconnecting to Redis server...')
})

export async function connectRedis() {
  if (!env.redisEnabled) {
    console.log('[redis] Redis is disabled via REDIS_ENABLED=false. Using in-memory cache only.')
    return false
  }

  if (isConnected) return true
  if (connectionPromise) return connectionPromise

  metrics.connectionAttempts++
  connectionPromise = (async () => {
    try {
      await client.connect()
      await client.ping()
      metrics.lastHealthCheck = new Date().toISOString()
      console.log(`[redis] Ping successful. Connected to ${redactedUrl(redisConfig.url)}`)
      return true
    } catch (err) {
      metrics.connectionFailures++
      console.warn(`[redis] Failed to connect: ${err.message}. Falling back to in-memory cache.`)
      isConnected = false
      connectionPromise = null
      return false
    }
  })()

  return connectionPromise
}

export async function redisHealthCheck() {
  if (!REDIS_ENABLED) {
    return { healthy: false, reason: 'Redis disabled via config' }
  }
  
  if (!isConnected) {
    return { healthy: false, reason: 'Not connected', metrics: getRedisMetrics() }
  }

  try {
    const start = performance.now()
    await client.ping()
    const latency = Math.round(performance.now() - start)
    metrics.lastHealthCheck = new Date().toISOString()
    
    // Never expose the Redis URL here: REDIS_URL may embed credentials and
    // health endpoints can be reachable without authentication.
    return {
      healthy: true,
      latency: `${latency}ms`,
      metrics: getRedisMetrics()
    }
  } catch (err) {
    metrics.errors++
    return {
      healthy: false,
      reason: err.message,
      metrics: getRedisMetrics()
    }
  }
}

export async function disconnectRedis() {
  if (!isConnected) return
  try {
    await client.quit()
    isConnected = false
  } catch (err) {
    console.warn(`[redis] Error during disconnect: ${err.message}`)
  }
}

export function getRedisClient() {
  return client
}

export function isRedisConnected() {
  return isConnected
}

export async function safeGet(key) {
  if (!isConnected) {
    metrics.misses++
    return null
  }
  try {
    const value = await client.get(key)
    if (value !== null) {
      metrics.hits++
    } else {
      metrics.misses++
    }
    return value
  } catch (err) {
    metrics.errors++
    auditLog('REDIS', 'Warning', `GET ${key} failed: ${err.message}`, 'warn')
    return null
  }
}

export async function safeSet(key, value, ttlSeconds = null) {
  if (!isConnected) return false
  try {
    if (ttlSeconds) {
      await client.set(key, value, { EX: ttlSeconds })
    } else {
      await client.set(key, value)
    }
    return true
  } catch (err) {
    auditLog('REDIS', 'Warning', `SET ${key} failed: ${err.message}`, 'warn')
    return false
  }
}

export async function safeDel(key) {
  if (!isConnected) return false
  try {
    await client.del(key)
    return true
  } catch (err) {
    auditLog('REDIS', 'Warning', `DEL ${key} failed: ${err.message}`, 'warn')
    return false
  }
}

// Atomically set a marker key only when it does not exist yet. Returns true if
// this call created the key (first writer wins) — useful for de-duplication.
export async function safeSetNx(key, ttlSeconds = null) {
  if (!isConnected) return false
  try {
    const options = ttlSeconds ? { EX: ttlSeconds } : undefined
    const result = await client.set(key, '1', options)
    return result === 'OK'
  } catch (err) {
    auditLog('REDIS', 'Warning', `SETNX ${key} failed: ${err.message}`, 'warn')
    return false
  }
}

export async function safeExists(key) {
  if (!isConnected) return false
  try {
    return (await client.exists(key)) > 0
  } catch {
    return false
  }
}

export async function safeIncr(key, ttlSeconds = null) {
  if (!isConnected) return null
  try {
    // Fast path: claim a fresh window atomically (INCR + EXPIRE in one command).
    if (ttlSeconds) {
      const created = await client.set(key, '1', { EX: ttlSeconds, NX: true })
      if (created === 'OK') return 1
    }
    const val = await client.incr(key)
    if (ttlSeconds && val === 1) {
      await client.expire(key, ttlSeconds)
    } else if (ttlSeconds && val > 1) {
      // Repair path: a crash between INCR and EXPIRE could leave the counter
      // without a TTL, permanently locking the key out. Give it a TTL again.
      const currentTtl = await safeTTL(key)
      if (currentTtl === -1) await client.expire(key, ttlSeconds)
    }
    return val
  } catch (err) {
    metrics.errors++
    auditLog('REDIS', 'Warning', `INCR ${key} failed: ${err.message}`, 'warn')
    return null
  }
}

export async function safeDecr(key) {
  if (!isConnected) return null
  try {
    return await client.decr(key)
  } catch (err) {
    metrics.errors++
    auditLog('REDIS', 'Warning', `DECR ${key} failed: ${err.message}`, 'warn')
    return null
  }
}

export async function safeTTL(key) {
  if (!isConnected) return -2
  try {
    return await client.ttl(key)
  } catch {
    return -2
  }
}