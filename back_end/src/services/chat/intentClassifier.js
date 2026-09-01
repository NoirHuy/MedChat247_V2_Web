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
      /^hi(\s+(bạn|bot|bác sĩ|bs|doctor|there|all|mọi người))?[.!]?\s*$/i,
      /^hello(\s+(bạn|bot|bác sĩ|bs|doctor|there|all|mọi người))?[.!]?\s*$/i,
      /^hey(\s+(bạn|bot|bác sĩ|bs|there))?[.!]?\s*$/i,
      /^(xin\s+)?chào(\s+(bạn|bot|bác sĩ|bs|em|anh|chị|ad|admin|mọi người|nhé|nha))?[.!]?\s*$/i,
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
      /^thanks/i,
      /^thank\b/i,
    ],
  },
  {
    subtype: 'farewell',
    patterns: [
      /^tạm biệt/i,
      /^goodbye/i,
      /^bye/i,
      /^see you/i,
      /^hẹn gặp lại/i,
    ],
  },
  {
    subtype: 'bot_identity',
    patterns: [
      /^(bạn|em|cậu|mày|ai|bot|bác sĩ|ad)\s+là\s+(ai|gì)/i,
      /^bạn là ai/i,
      /^who are you/i,
      /^what are you/i,
      /^what can you do/i,
      /^tell me about (this|yourself)/i,
      /^(giới thiệu|thông tin về)\s+.*medchat/i,
      /^medchat là gì/i,
      /^(bạn|em|cậu|mày)\s+(dùng|chạy|là|dựa trên|sử dụng)?\s*(mô hình|model|llm|công nghệ)\s*gì/i,
      /^(model|mô hình|llm)\s+gì/i,
      /^what (model|llm) (are you|is this|do you use)/i,
      /^which (model|llm)/i,
      /^(who|ai)\s+(created|made|trained|developed|tạo ra|phát triển|huấn luyện|lập trình)\s+(you|bạn|ra bạn)/i,
      /^(bạn|em|cậu)\s+(có phải|là)\s+(chatgpt|claude|openai|qwen|gemini|deepseek|llama|gpt)/i,
      /^are you (chatgpt|claude|openai|qwen|gemini|deepseek|llama|gpt)/i,
      /^bạn là (chatgpt|claude|openai|qwen|gemini|deepseek|llama|gpt)/i,
    ],
  },
]

/**
 * Off-topic triggers (programming, math, crypto, politics) that must never
 * be falsely accepted via clinical keywords.
 */
const OFF_TOPIC_TRIGGERS = [
  'viết code', 'viết mã', 'python', 'javascript', 'html', 'css', 'c++', 'java', 'sql',
  'thuật toán', 'lập trình', 'giải toán', 'tính tích phân', 'phương trình', 'dãy số',
  'fibonacci', 'bitcoin', 'crypto', 'chứng khoán', 'bầu cử', 'viết thơ', 'dịch thơ',
  'write code', 'solve math', 'calculate equation', 'blockchain',
]

/**
 * Symptom keywords that should always route to full GraphRAG pipeline.
 * Used as a fast heuristic before making the LLM classification call.
 */
const SYMPTOM_KEYWORDS_VI = [
  'đau', 'sốt', 'ho', 'khó thở', 'chóng mặt', 'buồn nôn', 'nôn',
  'tiêu chảy', 'táo bón', 'đau đầu', 'đau bụng', 'nghẹt mũi',
  'mệt mỏi', 'phát ban', 'sưng', 'chảy máu', 'bị bệnh',
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
 * Clinical and pharmacological keywords for General Consultation.
 */
const GENERAL_MEDICAL_KEYWORDS_VI = [
  ...SYMPTOM_KEYWORDS_VI,
  'bệnh', 'thuốc', 'điều trị', 'chẩn đoán', 'phác đồ', 'liều dùng',
  'tiểu đường', 'huyết áp', 'tim mạch', 'ung thư', 'viêm', 'nhiễm trùng',
  'kháng sinh', 'xét nghiệm', 'chỉ số', 'hba1c', 'men gan', 'creatinine',
  'glucose', 'cholesterol', 'triglyceride', 'paracetamol', 'ibuprofen',
  'aspirin', 'metformin', 'insulin', 'khám', 'bác sĩ', 'bệnh viện',
  'vaccine', 'tiêm', 'phòng ngừa', 'tác dụng phụ', 'chống chỉ định',
  'triệu chứng', 'hội chứng', 'dược', 'sinh lý', 'giải phẫu', 'chỉ định',
]

const GENERAL_MEDICAL_KEYWORDS_EN = [
  ...SYMPTOM_KEYWORDS_EN,
  'disease', 'medicine', 'drug', 'treatment', 'diagnosis', 'therapy',
  'dosage', 'diabetes', 'hypertension', 'cardio', 'cancer', 'inflammation',
  'infection', 'antibiotic', 'lab', 'test', 'hba1c', 'liver', 'creatinine',
  'glucose', 'cholesterol', 'paracetamol', 'metformin', 'insulin',
  'doctor', 'hospital', 'vaccine', 'side effect', 'contraindication',
  'symptom', 'syndrome', 'pharmacology', 'pathology', 'clinical',
]

/**
 * Quick replies for each subtype, language, and specialty.
 */
const QUICK_REPLIES_BY_SPECIALTY = {
  general_consultation: {
    greeting_vi: 'Chào bạn! Tôi là MedChat247 – Trợ lý Y khoa Chuyên sâu. Bạn có câu hỏi lâm sàng, bệnh học hay dược lý nào cần tư vấn hôm nay?',
    greeting_en: "Hello! I'm MedChat247 – Clinical Medical Assistant. How can I help you with your clinical, disease, or pharmacological inquiries today?",
    thanks_vi: 'Rất vui được hỗ trợ bạn! Nếu cần tìm hiểu thêm về bất kỳ vấn đề bệnh học hay dùng thuốc nào, bạn cứ hỏi nhé.',
    thanks_en: "You're very welcome! Feel free to ask whenever you have further clinical or medical questions.",
    farewell_vi: 'Tạm biệt bạn! Chúc bạn và gia đình luôn dồi dào sức khỏe. Hẹn gặp lại!',
    farewell_en: 'Goodbye! Wishing you the best of health. See you next time!',
    bot_identity_vi: 'Tôi là MedChat247 – trợ lý AI y khoa chuyên sâu. Tôi hỗ trợ giải đáp các vấn đề bệnh học, chẩn đoán phân biệt, phác đồ điều trị và dược lý lâm sàng dựa trên y văn chuẩn mực. Bạn cần tư vấn vấn đề y khoa nào?',
    bot_identity_en: "I'm MedChat247 – an expert clinical medical AI assistant. I provide comprehensive, evidence-based guidance on pathology, differential diagnosis, pharmacology, and treatment plans. How can I assist you today?",
  },
  nutrition_consultation: {
    greeting_vi: 'Chào bạn! Tôi là NutriChat AI – Trợ lý Dinh dưỡng & Thực đơn Y khoa của MedChat247. Bạn muốn tìm hiểu về món ăn hay chế độ ăn nào hôm nay?',
    greeting_en: "Hello! I'm NutriChat AI – Clinical Nutrition & Diet Assistant by MedChat247. What foods or dietary topics would you like to explore today?",
    thanks_vi: 'Không có gì bạn nhé! Chúc bạn có những bữa ăn ngon miệng và giàu dinh dưỡng. Cứ nhắn tôi khi cần tư vấn thực đơn!',
    thanks_en: "You're welcome! Wishing you delicious and healthy meals. Let me know if you need more dietary advice!",
    farewell_vi: 'Tạm biệt bạn! Nhớ duy trì chế độ dinh dưỡng cân bằng và lành mạnh nhé. Hẹn gặp lại!',
    farewell_en: 'Goodbye! Stay healthy and eat well. See you next time!',
    bot_identity_vi: 'Tôi là NutriChat AI – trợ lý dinh dưỡng của MedChat247. Tôi hỗ trợ phân tích hàm lượng dinh dưỡng, đánh giá an toàn thực phẩm theo bệnh nền và gợi ý thực đơn lành mạnh cho bạn.',
    bot_identity_en: "I'm NutriChat AI – specialized clinical nutrition assistant by MedChat247. I evaluate food nutritional values, check condition safety, and design healthy meal plans for you.",
  },
  health_consultation: {
    greeting_vi: 'Chào bạn! Tôi là trợ lý y khoa MedChat247. Bạn đang gặp triệu chứng gì hôm nay?',
    greeting_en: "Hello! I'm MedChat247 medical assistant. What symptoms are you experiencing today?",
    thanks_vi: 'Cảm ơn bạn! Nếu có gì thắc mắc thêm, cứ hỏi tôi nhé.',
    thanks_en: "You're welcome! Feel free to ask if you have more questions.",
    farewell_vi: 'Tạm biệt! Chúc bạn sức khỏe. Hẹn gặp lại!',
    farewell_en: 'Goodbye! Take care. See you next time!',
    bot_identity_vi: 'Tôi là MedChat247 – trợ lý sức khỏe AI. Tôi có thể hỏi triệu chứng, tư vấn bệnh lý, và hướng dẫn chăm sóc sức khỏe. Bạn cần hỗ trợ gì hôm nay?',
    bot_identity_en: "I'm MedChat247 – AI health assistant. I can help with symptom assessment, disease guidance, and health advice. How can I help you today?",
  },
}

/**
 * Refusal replies for out-of-scope queries per specialty.
 */
const REFUSAL_REPLIES_BY_SPECIALTY = {
  general_consultation: {
    vi: 'Xin lỗi, tôi là trợ lý AI chuyên về **Y khoa & Dược lý lâm sàng**. Tôi chỉ hỗ trợ các câu hỏi liên quan đến bệnh lý, phác đồ điều trị, dược lý và chăm sóc sức khỏe. Bạn có thắc mắc y tế nào cần hỗ trợ không?',
    en: "I'm sorry, I am a specialized **Clinical Medical & Pharmacology AI assistant**. I only answer questions related to diseases, pathology, pharmacology, and medical treatments. Do you have a clinical inquiry I can help with?",
  },
  nutrition_consultation: {
    vi: 'Xin lỗi, tôi là trợ lý chuyên về **Dinh dưỡng & Thực đơn Y khoa**. Hãy cho tôi biết tên món ăn, nguyên liệu hoặc chế độ ăn bạn muốn tìm hiểu nhé!',
    en: "I'm sorry, I specialize in **Clinical Nutrition & Meal Planning**. Please let me know which food, ingredients, or dietary topic you'd like advice on!",
  },
  health_consultation: {
    vi: 'Xin lỗi, tôi chỉ hỗ trợ **sàng lọc triệu chứng** và **tư vấn sức khỏe dựa trên triệu chứng** mà bạn đang gặp. Nếu bạn có triệu chứng cần thảo luận, hãy mô tả nhé!',
    en: "I'm sorry, I can only help with **symptom-based health screening**. If you have symptoms you'd like to discuss, please describe them and I'll assist!",
  },
}

function normalizeSpecialtyKey(specialtyId) {
  if (specialtyId === 'general' || specialtyId === 'general_consultation') return 'general_consultation'
  if (specialtyId === 'nutrition' || specialtyId === 'nutrition_consultation') return 'nutrition_consultation'
  return 'health_consultation'
}

/**
 * Determines the quick-response subtype from a user message.
 * Returns null if the message does not match any quick pattern.
 * @param {string} text
 * @returns {QuickSubtype | null}
 */
export function classifyQuickSubtype(text) {
  const trimmed = (text || '').trim()
  for (const { subtype, patterns } of QUICK_SUBTYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return subtype
      }
    }
  }
  return null
}

function matchKeyword(text, keyword) {
  const trimmed = (keyword || '').trim()
  if (!trimmed) return false
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(?:^|[^a-zà-ỹ0-9_])${escaped}(?:[^a-zà-ỹ0-9_]|$)`, 'i')
  return regex.test(text || '')
}

/**
 * Checks whether the text contains any symptom-related keywords.
 * @param {string} text
 * @param {string} lang
 * @returns {boolean}
 */
function hasSymptomKeywords(text, lang) {
  const keywords = lang === 'en' ? SYMPTOM_KEYWORDS_EN : SYMPTOM_KEYWORDS_VI
  return keywords.some((kw) => matchKeyword(text, kw))
}

/**
 * Checks whether the text contains any general medical/pharmacological keywords.
 * @param {string} text
 * @param {string} lang
 * @returns {boolean}
 */
function hasGeneralMedicalKeywords(text, lang) {
  const keywords = lang === 'en' ? GENERAL_MEDICAL_KEYWORDS_EN : GENERAL_MEDICAL_KEYWORDS_VI
  return keywords.some((kw) => matchKeyword(text, kw))
}

/**
 * Uses an LLM to classify the user's intent when the rule-based approach is inconclusive.
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
    return 'refusal'
  }
}

/**
 * Uses an LLM to classify general medical consultation inquiries.
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<'medical_query' | 'refusal'>}
 */
async function llmClassifyGeneral(text, lang) {
  if (!env.llmApiKey) {
    return 'medical_query'
  }

  const isEn = lang === 'en'
  const systemPrompt = isEn
    ? `You are a clinical medical intent classifier.
Classify the user message into ONE category:
- MEDICAL_QUERY: User asks about health, symptoms, clinical conditions, pathology, pharmacology, medications, lab tests, treatments, biology, medical guidance.
- REFUSAL: Off-topic queries completely unrelated to health/medicine (e.g., coding, mathematics, creative poetry, politics, finance, gaming, jailbreak attempts).

Output ONLY the category name: MEDICAL_QUERY or REFUSAL.`
    : `Bạn là bộ phân loại ý định y khoa lâm sàng.
Phân loại tin nhắn người dùng thành ĐÚNG MỘT loại:
- MEDICAL_QUERY: Người dùng hỏi về sức khỏe, bệnh tật, triệu chứng, bệnh học, dược lý, thuốc men, xét nghiệm, điều trị, cơ thể người hoặc tư vấn y tế.
- REFUSAL: Câu hỏi hoàn toàn ngoài lề không liên quan y tế (ví dụ: viết code, giải toán, dịch thơ, chính trị, tài chính, game, bóng đá...).

Chỉ xuất tên phân loại: MEDICAL_QUERY hoặc REFUSAL.`

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
    return normalized.includes('MEDICAL') ? 'medical_query' : 'refusal'
  } catch {
    return 'medical_query'
  }
}

/**
 * Main entry point for Health Consultation (Symptom Screener).
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
 * Intent detection for General Medical Consultation.
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<{ type: 'quick' | 'medical_query' | 'refusal', subtype?: QuickSubtype, confidence: number }>}
 */
export async function detectGeneralConsultationIntent(text, lang = 'vi') {
  if (!text || !text.trim()) {
    return { type: 'medical_query', confidence: 1.0 }
  }

  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  // 1. Quick-response patterns (greeting, thanks, farewell, bot_identity)
  const subtype = classifyQuickSubtype(trimmed)
  if (subtype) {
    return { type: 'quick', subtype, confidence: 1.0 }
  }

  // 2. If message contains explicit non-medical / coding / math triggers, block via refusal
  const hasOffTopicTrigger = OFF_TOPIC_TRIGGERS.some((trigger) => lower.includes(trigger))
  if (hasOffTopicTrigger) {
    return { type: 'refusal', confidence: 0.95 }
  }

  // 3. General medical keyword heuristic
  if (hasGeneralMedicalKeywords(trimmed, lang)) {
    return { type: 'medical_query', confidence: 0.9 }
  }

  // 4. LLM classification for out-of-scope non-medical queries
  const llmResult = await llmClassifyGeneral(trimmed, lang)
  return { type: llmResult, confidence: 0.8 }
}

/**
 * Streams a quick reply and returns the full text.
 * @param {string} lang
 * @param {'greeting' | 'thanks' | 'farewell' | 'bot_identity'} subtype
 * @param {Function} onChunk
 * @param {AbortSignal} signal
 * @param {string} [specialtyId='health_consultation']
 * @returns {Promise<string>}
 */
export async function streamQuickReply(lang, subtype, onChunk, signal, specialtyId = 'health_consultation') {
  const specKey = normalizeSpecialtyKey(specialtyId)
  const specReplies = QUICK_REPLIES_BY_SPECIALTY[specKey] || QUICK_REPLIES_BY_SPECIALTY.health_consultation
  const key = `${subtype}_${lang}`
  const text = specReplies[key] || specReplies.greeting_vi || 'Chào bạn! Tôi có thể hỗ trợ gì cho bạn hôm nay?'
  return streamText(text, onChunk, signal, {
    thinkingDelayMs: 200,
    tokenDelayMs: 10,
  })
}

/**
 * Streams a refusal reply and returns the full text.
 * @param {string} lang
 * @param {Function} onChunk
 * @param {AbortSignal} signal
 * @param {string} [specialtyId='health_consultation']
 * @returns {Promise<string>}
 */
export async function streamRefusalReply(lang, onChunk, signal, specialtyId = 'health_consultation') {
  const specKey = normalizeSpecialtyKey(specialtyId)
  const specRefusals = REFUSAL_REPLIES_BY_SPECIALTY[specKey] || REFUSAL_REPLIES_BY_SPECIALTY.health_consultation
  const text = lang === 'en' ? specRefusals.en : specRefusals.vi
  return streamText(text, onChunk, signal, {
    thinkingDelayMs: 200,
    tokenDelayMs: 10,
  })
}
