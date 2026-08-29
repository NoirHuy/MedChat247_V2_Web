import { env } from '../../config/env.js'
import { callLLM } from '../llm/llmClient.js'
import { streamText } from '../llm/streaming.js'

/**
 * Intent types for routing decisions.
 * @typedef {'quick' | 'refusal' | 'symptom_query'} IntentType
 * @typedef {'greeting' | 'thanks' | 'farewell' | 'bot_identity'} QuickSubtype
 */

/**
 * @typedef {Object} IntentResult
 * @property {IntentType} type
 * @property {QuickSubtype} [subtype]
 * @property {number} confidence
 */

// Quick-response subtype patterns (evaluated in order)
const QUICK_SUBTYPE_PATTERNS = [
  {
    subtype: 'greeting',
    patterns: [
      /^hi[.!]?\s*$/i,
      /^hello[.!]?\s*$/i,
      /^hey[.!]?\s*$/i,
      /^chào[.!]?\s*$/i,
      /^xin chào[.!]?\s*$/i,
      /^namaste[.!]?\s*$/i,
      /^halo[.!]?\s*$/i,
      /^good morning[.!]?\s*$/i,
      /^good afternoon[.!]?\s*$/i,
      /^good evening[.!]?\s*$/i,
    ],
  },
  {
    subtype: 'thanks',
    patterns: [
      /^cảm ơn/i,
      /^cám ơn/i,
      /^thank you/i,
      /^thanks[.!]?\s*$/i,
      /^thank\b/i,
    ],
  },
  {
    subtype: 'farewell',
    patterns: [
      /^tạm biệt/i,
      /^goodbye[.!]?\s*$/i,
      /^bye[.!]?\s*$/i,
      /^see you/i,
      /^hẹn gặp lại/i,
    ],
  },
  {
    subtype: 'bot_identity',
    patterns: [
      /^bạn là ai/i,
      /^who are you/i,
      /^what are you/i,
      /^what can you do/i,
      /^tell me about this/i,
      /^giới thiệu.*medchat/i,
      /^medchat là gì/i,
    ],
  },
]

/**
 * Symptom keywords that should always route to full GraphRAG pipeline.
 * Used as a fast heuristic before making the LLM classification call.
 */
const SYMPTOM_KEYWORDS_VI = [
  'đau', 'sốt', 'ho', 'khó thở', 'chóng mặt', 'buồn nôn', 'nôn',
  'tiêu chảy', 'táo bón', 'đau đầu', 'đau bụng', 'nghẹt mũi',
  'mệt mỏi', 'phát ban', 'sưng', 'chảy máu', 'bị ', 'bị bệnh',
  'ngứa', 'chảy dịch', 'nổi mẩn', 'đau họng', 'khó nuốt', 'ói',
  'đau ngực', 'đau lưng', 'chướng bụng', 'chán ăn',
  'sụt cân', 'mất ngủ', 'lo âu', 'đau cơ', 'đau khớp',
]

const SYMPTOM_KEYWORDS_EN = [
  'pain', 'fever', 'cough', 'headache', 'nausea', 'vomit', 'diarrhea',
  'dizzy', 'tired', 'fatigue', 'rash', 'swelling', 'bleeding', 'sick', 'ill',
  'sore throat', 'chest pain', 'back pain', 'stomach pain', 'bloating',
  'loss of appetite', 'weight loss', 'insomnia', 'anxiety', 'muscle pain',
  'joint pain', 'shortness of breath',
]

/**
 * Quick replies for each subtype and language.
 */
const QUICK_REPLIES = {
  greeting_vi: 'Chào bạn! Tôi là trợ lý y khoa MedChat247. Bạn đang gặp triệu chứng gì hôm nay?',
  greeting_en: "Hello! I'm MedChat247 medical assistant. What symptoms are you experiencing today?",
  thanks_vi: 'Cảm ơn bạn! Nếu có gì thắc mắc thêm, cứ hỏi tôi nhé.',
  thanks_en: "You're welcome! Feel free to ask if you have more questions.",
  farewell_vi: 'Tạm biệt! Chúc bạn sức khỏe. Hẹn gặp lại!',
  farewell_en: 'Goodbye! Take care. See you next time!',
  bot_identity_vi: 'Tôi là MedChat247 – trợ lý sức khỏe AI. Tôi có thể hỏi triệu chứng, tư vấn bệnh lý, và hướng dẫn chăm sóc sức khỏe. Bạn cần hỗ trợ gì hôm nay?',
  bot_identity_en: "I'm MedChat247 – AI health assistant. I can help with symptom assessment, disease guidance, and health advice. How can I help you today?",
}

/**
 * Refusal replies for out-of-scope queries.
 */
const REFUSAL_REPLIES = {
  vi: 'Xin lỗi, tôi chỉ hỗ trợ **sàng lọc triệu chứng** và **tư vấn sức khỏe dựa trên triệu chứng** mà bạn đang gặp. Nếu bạn có triệu chứng cần thảo luận, hãy mô tả nhé!',
  en: "I'm sorry, I can only help with **symptom-based health screening**. If you have symptoms you'd like to discuss, please describe them and I'll assist!",
}

/**
 * Determines the quick-response subtype from a user message.
 * Returns null if the message does not match any quick pattern.
 * @param {string} text
 * @returns {QuickSubtype | null}
 */
export function classifyQuickSubtype(text) {
  const trimmed = text.trim()
  for (const { subtype, patterns } of QUICK_SUBTYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return subtype
      }
    }
  }
  return null
}

/**
 * Checks whether the text contains any symptom-related keywords.
 * @param {string} text
 * @param {string} lang
 * @returns {boolean}
 */
function hasSymptomKeywords(text, lang) {
  const lower = text.toLowerCase()
  const keywords = lang === 'en' ? SYMPTOM_KEYWORDS_EN : SYMPTOM_KEYWORDS_VI
  return keywords.some((kw) => lower.includes(kw))
}

/**
 * Uses an LLM to classify the user's intent when the rule-based
 * approach is inconclusive.
 *
 * Returns:
 *  - 'symptom_query' if the user is describing/experiencing symptoms
 *  - 'refusal' for all other cases (definitions, off-topic, etc.)
 *
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<'symptom_query' | 'refusal'>}
 */
async function llmClassify(text, lang) {
  if (!env.llmApiKey) {
    return 'refusal'
  }

  const isEn = lang === 'en'
  const systemPrompt = isEn
    ? `You are a medical intent classifier.
Classify the user message into exactly ONE category:
- SYMPTOM_QUERY: User describes, mentions, or denies symptoms. Examples: "I have a headache", "I don't have fever", "my stomach hurts"
- REFUSAL: Everything else. Examples: "what is fever", "how does paracetamol work", "tell me about diabetes", "hi", "thanks"

Output ONLY the category name, nothing else.`
    : `Bạn là bộ phân loại ý định y khoa.
Phân loại tin nhắn của người dùng thành ĐÚNG MỘT loại:
- SYMPTOM_QUERY: Người dùng mô tả, nhắc đến hoặc phủ nhận triệu chứng. Ví dụ: "tôi bị đau đầu", "tôi không bị sốt", "bụng tôi đau"
- REFUSAL: Mọi thứ khác. Ví dụ: "sốt là gì", "thuốc paracetamol uống như thế nào", "cho tôi biết về tiểu đường", "hi", "cảm ơn"

Chỉ trả về tên loại, không thêm gì khác.`

  try {
    const result = await callLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      model: env.openrouterModelNer,
      stream: false,
      maxTokens: 10,
      timeoutMs: 8000,
    })

    const normalized = (result || '').trim().toUpperCase()
    return normalized.includes('SYMPTOM') ? 'symptom_query' : 'refusal'
  } catch {
    // LLM failure: default to refusal (safer than routing to full pipeline)
    return 'refusal'
  }
}

/**
 * Main entry point: classifies a user message into an IntentResult.
 *
 * Decision order:
 *  1. Quick patterns (greeting / thanks / farewell / bot identity) → type: 'quick'
 *  2. Symptom keywords present → type: 'symptom_query'
 *  3. LLM classifies the remainder
 *     - SYMPTOM_QUERY → symptom_query
 *     - anything else → refusal
 *
 * @param {string} text         - The last user message content
 * @param {string} lang         - 'vi' | 'en'
 * @returns {Promise<IntentResult>}
 */
export async function detectIntent(text, lang = 'vi') {
  if (!text || !text.trim()) {
    return { type: 'symptom_query', confidence: 1.0 }
  }

  const trimmed = text.trim()

  // 1. Quick-response patterns
  const subtype = classifyQuickSubtype(trimmed)
  if (subtype) {
    return { type: 'quick', subtype, confidence: 1.0 }
  }

  // 2. Symptom keyword heuristic — immediate SYMPTOM_QUERY
  if (hasSymptomKeywords(trimmed, lang)) {
    return { type: 'symptom_query', confidence: 0.85 }
  }

  // 3. LLM classification for ambiguous cases
  const llmResult = await llmClassify(trimmed, lang)
  return { type: llmResult, confidence: 0.75 }
}

/**
 * Streams a quick reply and returns the full text.
 * @param {string} lang
 * @param {'greeting' | 'thanks' | 'farewell' | 'bot_identity'} subtype
 * @param {Function} onChunk
 * @param {AbortSignal} signal
 * @returns {Promise<string>}
 */
export async function streamQuickReply(lang, subtype, onChunk, signal) {
  const key = `${subtype}_${lang}`
  const text = QUICK_REPLIES[key] || QUICK_REPLIES.greeting_vi
  return streamText(text, onChunk, signal, {
    thinkingDelayMs: 300,
    tokenDelayMs: 12,
  })
}

/**
 * Streams a refusal reply and returns the full text.
 * @param {string} lang
 * @param {Function} onChunk
 * @param {AbortSignal} signal
 * @returns {Promise<string>}
 */
export async function streamRefusalReply(lang, onChunk, signal) {
  const text = lang === 'en' ? REFUSAL_REPLIES.en : REFUSAL_REPLIES.vi
  return streamText(text, onChunk, signal, {
    thinkingDelayMs: 300,
    tokenDelayMs: 12,
  })
}
