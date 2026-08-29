import neo4j from 'neo4j-driver'
import { env } from '../../config/env.js'
import { isRedisConnected, safeGet, safeSet } from '../../config/redis.js'

const driver = neo4j.driver(
  env.neo4jUri,
  neo4j.auth.basic(env.neo4jUsername, env.neo4jPassword)
)

export function getSession() {
  return driver.session({ database: env.neo4jDatabase })
}

export async function closeDriver() {
  await driver.close()
}

// ─── TTL CACHE (60 MINUTES for static symptom data) ────────────────────────
const CACHE_TTL_SECONDS = 60 * 60 // 60 minutes - increased from 10 minutes for better performance

const KEY_SYMPTOMS = 'neo4j:symptoms'
const KEY_SYMPTOM_NAMES = 'neo4j:symptom_names'
const KEY_DISEASE_OVERVIEW = 'neo4j:disease_overview'

// In-memory fallback cache
const memCache = new Map()

function memGet(key) {
  const entry = memCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memCache.delete(key)
    return null
  }
  return entry.value
}

function memSet(key, value, ttlSeconds) {
  memCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

async function cacheGet(key) {
  if (isRedisConnected()) {
    try {
      const raw = await safeGet(key)
      if (raw) return JSON.parse(raw)
    } catch (err) {
      console.warn(`[neo4jClient] cacheGet ${key} Redis failed: ${err.message}`)
    }
  }
  return memGet(key)
}

async function cacheSet(key, value, ttlSeconds = CACHE_TTL_SECONDS) {
  if (isRedisConnected()) {
    try {
      await safeSet(key, JSON.stringify(value), ttlSeconds)
      return
    } catch (err) {
      console.warn(`[neo4jClient] cacheSet ${key} Redis failed: ${err.message}`)
    }
  }
  memSet(key, value, ttlSeconds)
}

export async function getAllSymptoms(session) {
  const cached = await cacheGet(KEY_SYMPTOMS)
  if (cached) return cached

  const res = await session.run('MATCH (s:Symptom) RETURN s.id AS id, s.name AS name, s.cui AS cui ORDER BY s.name')
  const symptoms = res.records.map(r => ({
    id: r.get('id'),
    name: r.get('name'),
    cui: r.get('cui') || null
  }))
  await cacheSet(KEY_SYMPTOMS, symptoms)
  return symptoms
}

export async function getAllSymptomNames(session) {
  const cached = await cacheGet(KEY_SYMPTOM_NAMES)
  if (cached) return cached

  const symptoms = await getAllSymptoms(session)
  const names = symptoms.map(s => s.name)
  await cacheSet(KEY_SYMPTOM_NAMES, names)
  return names
}

export async function getDiseaseOverview(session) {
  const cached = await cacheGet(KEY_DISEASE_OVERVIEW)
  if (cached) return cached

  const res = await session.run(`
    MATCH (d:Disease)-[r:HAS_SYMPTOM]->(s:Symptom)
    WITH d, collect({symptom: s.name, prob: r.probability, description: s.description}) AS symptoms
    OPTIONAL MATCH (d)-[ra:AFFECTS_AGE]->(a:AgeGroup)
    WITH d, symptoms, collect(DISTINCT {age: a.name, prob: ra.probability}) AS ages
    OPTIONAL MATCH (d)-[rg:AFFECTS_SEX]->(g:Sex)
    WITH d, symptoms, ages, collect(DISTINCT {sex: g.name, prob: rg.probability}) AS sexes
    RETURN d.name AS disease, d.description AS description, d.remarks AS remarks, symptoms, ages, sexes
    ORDER BY d.name
  `)
  const overview = res.records.map(r => ({
    name: r.get('disease'),
    description: r.get('description') || '',
    remarks: r.get('remarks') || '',
    symptoms: r.get('symptoms').map(s => ({
      symptom: s.symptom,
      prob: s.prob,
      description: s.description || ''
    })).sort((a, b) => b.prob - a.prob).slice(0, 6),
    ages: r.get('ages').filter(a => a.age && a.prob).sort((a, b) => b.prob - a.prob).slice(0, 2),
    sexes: r.get('sexes').filter(s => s.sex && s.prob)
  }))
  await cacheSet(KEY_DISEASE_OVERVIEW, overview)
  return overview
}

/**
 * Invalidate all Neo4j caches (e.g. after a knowledge-graph update).
 */
export async function invalidateNeo4jCache() {
  memCache.clear()
  if (isRedisConnected()) {
    const { safeDel } = await import('../../config/redis.js')
    await Promise.all([
      safeDel(KEY_SYMPTOMS),
      safeDel(KEY_SYMPTOM_NAMES),
      safeDel(KEY_DISEASE_OVERVIEW),
    ])
  }
}