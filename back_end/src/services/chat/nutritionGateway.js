import { env } from '../../config/env.js'
import { streamText } from '../llm/streaming.js'

const NUTRITION_SPECIALTY_ID = 'nutrition_consultation'
const NUTRITION_MARKER = '__NUTRITION_DATA__:'

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
  return sentences.slice(0, 2).join(' ').trim() || raw.slice(0, 180)
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

async function callNutritionService({ message, conditions, signal }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Nutrition service timeout')), env.nutritionTimeoutMs)
  const onAbort = () => controller.abort(new Error('aborted'))
  signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(`${env.nutritionServiceUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conditions }),
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

export async function streamNutritionReply({ messages, conditions, onChunk, signal }) {
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

  const data = await callNutritionService({
    message: lastUserText,
    conditions: sanitizeConditions(conditions),
    signal,
  })

  if (data?.structured_data && typeof data.structured_data === 'object') {
    const cardData = {
      ...data.structured_data,
      llm_note: extractLlmNote(data.reply_text || ''),
    }
    const marker = `${NUTRITION_MARKER}${JSON.stringify(cardData)}`
    onChunk?.(marker)
    return { fullReplyText: marker, memoriesUsed: [], performanceMeta: { nutritionGateway: true, mode: 'card' } }
  }

  const fullReplyText =
    (data?.reply_text || '').trim() ||
    'Tôi là Trợ lý Dinh dưỡng NutriChat AI. Bạn hãy cho tôi biết món ăn hoặc nguyên liệu bạn quan tâm nhé!'
  await streamText(fullReplyText, onChunk, signal, { thinkingDelayMs: 200, tokenDelayMs: 10 })
  return { fullReplyText, memoriesUsed: [], performanceMeta: { nutritionGateway: true, mode: 'text' } }
}
