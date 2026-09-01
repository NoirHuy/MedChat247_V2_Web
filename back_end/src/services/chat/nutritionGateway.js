import { env } from '../../config/env.js'
import { streamText } from '../llm/streaming.js'

const NUTRITION_SPECIALTY_ID = 'nutrition_consultation'
const NUTRITION_MARKER = '__NUTRITION_DATA__:'

// Multi-turn context: how many previous messages are forwarded to Flask and
// how long per-conversation detected conditions survive between turns.
const HISTORY_MESSAGE_LIMIT = 8
const HISTORY_CONTENT_MAX_CHARS = 2000
const CONDITIONS_TTL_MS = 30 * 60 * 1000
const CONDITIONS_CACHE_MAX = 200

const conditionsCache = new Map() // conversationId -> { conditions: string[], expiresAt }

const GREETING_RE =
  /^(Chào bạn|Hello|Rất vui|Xin chào|Với tư cách|Tôi xin được|Dưới góc độ|Về câu hỏi|Theo đánh giá)[^:!?\n]*[:!?\n]\s*/gi

function cleanReplyText(raw) {
  return (raw || '')
    .trim()
    .replace(/\[MODERATE\]/gi, 'cần lưu ý kiểm soát')
    .replace(/\[SAFE\]/gi, 'an toàn')
    .replace(/\[AVOID\]/gi, 'nên hạn chế')
    .replace(/MODERATE/g, 'Cần lưu ý')
    .replace(/SAFE/g, 'An toàn')
    .replace(/AVOID/g, 'Nên hạn chế')
    .replace(/#{1,4}\s[^\n]*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(GREETING_RE, '')
}

function extractLlmNote(rawReply) {
  const raw = cleanReplyText(rawReply)
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && !/^(Chào|Hello|Rất vui|Xin chào|Với tư cách)/i.test(s))
    // Câu hỏi tu từ ("Tại sao cần thận trọng?") không có ý nghĩa khi đứng
    // một mình trong ghi chú ngắn trên card.
    .filter((s) => !s.endsWith('?'))
    // Heading / nhãn mục viết hoa bị cắt dở hoặc câu sáo rỗng dẫn nhập.
    .filter((s) => !/^(ĐỀ XUẤT|LỜI KHUYÊN|PHÂN TÍCH|HƯỚNG DẪN|KẾT LUẬN)/.test(s))
    .filter((s) => !/^(Dưới đây|Hãy cùng|Chúng ta hãy|Chúng ta cùng)/i.test(s))
    // Cụm viết hoa toàn bộ là heading của markdown đã bị stripped dở
    // (kiểm tra "không có chữ thường" thay vì match uppercase — range
    // unicode [A-ZÀ-Ỹ] bao luôn cả chữ thường tiếng Việt).
    .filter((s) => !(s.length >= 12 && !/[a-zà-ỹ]/.test(s)))
  const note = sentences.slice(0, 2).join(' ').trim()
  if (!note) return raw.slice(0, 180).trim()
  if (note.length <= 220) return note
  // Cắt đúng biên từ, không đứt giữa chữ
  return `${note.slice(0, 220).replace(/\s+\S*$/, '')}…`
}

export function stripNutritionMarker(text) {
  if (!text || !text.includes(NUTRITION_MARKER)) return text
  return text.replace(/__NUTRITION_DATA__:[\s\S]*/g, '').trim()
}

export function isNutritionSpecialty(specialtyId) {
  return specialtyId === NUTRITION_SPECIALTY_ID
}

function sanitizeConditions(conditions) {
  if (!Array.isArray(conditions)) return []
  return conditions
    .filter((c) => typeof c === 'string' && c.trim().length > 0 && c.length <= 64)
    .slice(0, 10)
    .map((c) => c.trim())
}

function getCachedConditions(conversationId) {
  if (!conversationId) return []
  const entry = conditionsCache.get(conversationId)
  if (!entry) return []
  if (Date.now() > entry.expiresAt) {
    conditionsCache.delete(conversationId)
    return []
  }
  return entry.conditions
}

function cacheConditions(conversationId, conditions) {
  if (!conversationId || !Array.isArray(conditions) || conditions.length === 0) return
  if (conditionsCache.size >= CONDITIONS_CACHE_MAX) {
    // Evict the oldest conversation to keep memory bounded
    conditionsCache.delete(conditionsCache.keys().next().value)
  }
  conditionsCache.set(conversationId, { conditions, expiresAt: Date.now() + CONDITIONS_TTL_MS })
}

export function resetNutritionConditionsCache() {
  conditionsCache.clear()
}

// Builds the multi-turn history for Flask: every message before the last user
// turn (which is sent as `message`), assistant marker payloads stripped.
export function buildNutritionHistory(messages) {
  if (!Array.isArray(messages)) return []
  const lastUserIdx = messages.map((m) => m?.role).lastIndexOf('user')
  const historySource = lastUserIdx === -1 ? [] : messages.slice(0, lastUserIdx)
  const history = []
  for (let i = historySource.length - 1; i >= 0 && history.length < HISTORY_MESSAGE_LIMIT; i--) {
    const m = historySource[i]
    if (m?.role !== 'user' && m?.role !== 'assistant') continue
    const content = stripNutritionMarker(typeof m.content === 'string' ? m.content : '')
    history.unshift({
      role: m.role,
      content: (content || '[Thẻ dữ liệu dinh dưỡng]').slice(0, HISTORY_CONTENT_MAX_CHARS),
    })
  }
  return history
}

async function callNutritionService({ message, conditions, history, signal }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Nutrition service timeout')), env.nutritionTimeoutMs)
  const onAbort = () => controller.abort(new Error('aborted'))
  signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(`${env.nutritionServiceUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conditions, history }),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`Nutrition service responded ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function streamNutritionReply({ messages, conditions, conditionsSource = 'none', conversationId = null, onChunk, signal }) {
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
  const history = buildNutritionHistory(messages)

  // Conditions from the request (memory profile + explicit) take precedence;
  // conditions detected in previous turns of this conversation fill the gaps.
  const requestConditions = sanitizeConditions(conditions)
  const cachedConditions = getCachedConditions(conversationId)
  const mergedConditions = [...new Set([...requestConditions, ...cachedConditions])].slice(0, 10)

  const data = await callNutritionService({
    message: lastUserText,
    conditions: mergedConditions,
    history,
    signal,
  })

  if (Array.isArray(data?.active_conditions) && data.active_conditions.length > 0) {
    cacheConditions(conversationId, sanitizeConditions(data.active_conditions))
  }

  if (data?.structured_data && typeof data.structured_data === 'object') {
    const cardData = {
      ...data.structured_data,
      llm_note: extractLlmNote(data.reply_text || ''),
    }
    const marker = `${NUTRITION_MARKER}${JSON.stringify(cardData)}`
    onChunk?.(marker)
    return {
      fullReplyText: marker,
      memoriesUsed: [],
      performanceMeta: {
        nutritionGateway: true,
        mode: 'card',
        conditionsSource,
        conditionsCount: mergedConditions.length,
        conditionsCached: cachedConditions.length > 0,
        historyTurns: Math.floor(history.length / 2),
        resolvedFromHistory: data?.resolved_from_history === true,
      },
    }
  }

  const fullReplyText =
    (data?.reply_text || '').trim() ||
    'Tôi là Trợ lý Dinh dưỡng NutriChat AI. Bạn hãy cho tôi biết món ăn hoặc nguyên liệu bạn quan tâm nhé!'
  await streamText(fullReplyText, onChunk, signal, { thinkingDelayMs: 200, tokenDelayMs: 10 })
  return {
    fullReplyText,
    memoriesUsed: [],
    performanceMeta: {
      nutritionGateway: true,
      mode: 'text',
      conditionsSource,
      conditionsCount: mergedConditions.length,
      conditionsCached: cachedConditions.length > 0,
      historyTurns: Math.floor(history.length / 2),
      resolvedFromHistory: data?.resolved_from_history === true,
    },
  }
}
