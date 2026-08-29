import { env } from '../../config/env.js'

const CATEGORY_WEIGHTS = {
  allergy: 10,
  chronic_condition: 9,
  medication: 8,
  pregnancy: 8,
  blood_type: 7,
  past_episode: 5,
  lifestyle: 3,
  display_preference: 2,
}

const IMPORTANCE_WEIGHTS = {
  critical: 10,
  high: 8,
  medium: 5,
  low: 2,
}

/**
 * Ranks active user memories based on query relevance, category importance, severity, and recency,
 * and selects top items fitting within env.memoryTokenBudget (~500 tokens).
 * 
 * @param {Array} memories - Decrypted active user memory objects
 * @param {string} currentQuery - User's latest prompt text
 * @returns {Array} Array of top ranked memories fitting the token budget
 */
export function rankMemoriesForPrompt(memories = [], currentQuery = '') {
  if (!Array.isArray(memories) || memories.length === 0) return []

  const tokenBudget = env.memoryTokenBudget || 500
  const queryLower = (currentQuery || '').toLowerCase()

  const scored = memories.map(mem => {
    const contentLower = (mem.content || '').toLowerCase()

    // 1. Semantic / keyword relevance score (0 - 10)
    let relevanceScore = 1
    if (queryLower) {
      const words = contentLower.split(/\s+/).filter(w => w.length > 2)
      let matchCount = 0
      for (const w of words) {
        if (queryLower.includes(w)) matchCount++
      }
      if (matchCount > 0) {
        relevanceScore = Math.min(10, matchCount * 3 + 2)
      }
    }

    // 2. Importance score (0 - 10)
    const importanceScore = IMPORTANCE_WEIGHTS[mem.importance] || 5

    // 3. Category weight (0 - 10)
    const categoryScore = CATEGORY_WEIGHTS[mem.category] || 3

    // 4. Recency score (0 - 10)
    const ageDays = (Date.now() - new Date(mem.updatedAt || mem.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    const recencyScore = Math.max(1, 10 - ageDays * 0.1)

    // Formula: 0.4 * relevance + 0.3 * importance + 0.2 * category + 0.1 * recency
    const finalScore = 
      0.4 * relevanceScore +
      0.3 * importanceScore +
      0.2 * categoryScore +
      0.1 * recencyScore

    return {
      memory: mem,
      score: finalScore,
    }
  })

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score)

  // Select items up to memoryTokenBudget (approx 4 chars per token)
  let usedTokens = 0
  const selected = []

  for (const item of scored) {
    const mem = item.memory
    const itemTokenEst = Math.ceil((mem.content?.length || 0) / 4) + 15
    if (usedTokens + itemTokenEst <= tokenBudget) {
      selected.push(mem)
      usedTokens += itemTokenEst
    }
  }

  return selected
}
