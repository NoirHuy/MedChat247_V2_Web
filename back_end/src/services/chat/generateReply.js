import { env } from '../../config/env.js'
import { getSpecialty } from '../../config/specialties.js'
import { auditLog } from '../../utils/auditLog.js'
import { streamText } from '../llm/streaming.js'
import { callLLM, callFinetunedLLM, translateViToEn, translateEnToViStreaming } from '../llm/llmClient.js'
import { renderSystemPrompt } from '../prompts/promptRegistry.js'
import { computeAdaptiveContext } from '../graphrag/adaptiveContext.js'
import { extractSymptomsFromHistory } from '../graphrag/symptomExtraction.js'
import { formatAdaptiveContext } from '../graphrag/formatContext.js'
import { evaluatePhase } from './phaseEvaluator.js'
import { getSCEState, mergeSCEState, setSCEState } from '../graphrag/sceStateCache.js'
import { getStaticSuggestionReply } from './staticSuggestionReplies.js'
import { detectIntent, detectGeneralConsultationIntent, classifyQuickSubtype, streamQuickReply, streamRefusalReply } from './intentClassifier.js'
import { isNutritionSpecialty, streamNutritionReply } from './nutritionGateway.js'

function buildMockReply(userText, specialtyId, lang = 'vi') {
  const specialty = getSpecialty(specialtyId)
  const isEn = lang === 'en'
  const name = isEn ? specialty.name.en : specialty.name.vi

  if (isEn) {
    return `[Demo Mode — OPENROUTER_API_KEY not configured]\n\n` +
      `Thank you for contacting MedChat247 specialty **${name}**. ` +
      `Please add your API Key in the \`.env\` file to activate real AI ` +
      `integrated with the NLICE clinical knowledge graph.\n\n` +
      `*Instructions: Open \`medchat/back_end/.env\` and fill in \`OPENROUTER_API_KEY=...\`*`
  }

  return `[Chế độ demo — chưa cấu hình OPENROUTER_API_KEY]\n\n` +
    `Cảm ơn bạn đã liên hệ với MedChat247 chuyên khoa **${name}**. ` +
    `Vui lòng thêm API Key vào tệp \`.env\` để kích hoạt trí tuệ nhân tạo thật sự ` +
    `tích hợp đồ thị tri thức lâm sàng NLICE.\n\n` +
    `*Hướng dẫn: Mở \`medchat/back_end/.env\` và điền vào \`OPENROUTER_API_KEY=...\`*`
}

import { getActiveMemoryContext } from '../memory/memoryRetrieval.js'

export const GUEST_CTA = {
  vi: '\n\n---\n💡 **Gợi ý:** Bạn đang sử dụng mô hình AI cơ bản. Hãy [Đăng ký tài khoản miễn phí](#auth/signup) để mở khóa **Mô hình AI Y tế Tăng cường** (tích hợp Đồ thị Tri thức Y khoa & Trí nhớ bệnh án cá nhân).',
  en: '\n\n---\n💡 **Tip:** You are using the standard AI model. [Sign up for free](#auth/signup) to unlock the **Enhanced Medical AI Model** (powered by Knowledge Graph & Personal Clinical Memory).',
}

export async function generateReply({ messages, specialtyId, lang = 'vi', isSuggestionDemo = false, suggestionId = null, userId = null, sessionMemoryPaused = false, conversationId = null, conditions = null, conditionsSource = 'none', onChunk, signal }) {
  const isEn = lang === 'en'
  const isGuest = !userId
  const performanceMeta = {}
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

  const measureStage = async (name, operation) => {
    const startedAt = performance.now()
    try {
      return await operation()
    } finally {
      performanceMeta[name] = Math.round(performance.now() - startedAt)
    }
  }

  // ── NUTRITION SPECIALTY: forward to the Python nutrition microservice ──────
  // Auth, quota reservation, rate limiting, SystemLog and background memory
  // extraction are all handled upstream in chat.routes.js. The Flask engine
  // does not accept injected system prompts, so active memory retrieval is
  // skipped here (extraction still runs on the conversation afterwards).
  if (isNutritionSpecialty(specialtyId)) {
    return await measureStage('nutritionGatewayMs', () =>
      streamNutritionReply({ messages, conditions, conditionsSource, conversationId, onChunk, signal, lang }),
    )
  }

  // ── GENERAL CONSULTATION SPECIALTY: custom fine-tuned model (Modal vLLM) ─────
  if (specialtyId === 'general_consultation' || specialtyId === 'general') {
    // 1. Quick-response patterns (greeting, thanks, farewell, bot_identity)
    const quickSubtype = classifyQuickSubtype(lastUserText)
    if (quickSubtype) {
      const fullReplyText = await streamQuickReply(lang, quickSubtype, onChunk, signal, 'general_consultation')
      return {
        fullReplyText,
        memoriesUsed: [],
        performanceMeta: {
          specialty: 'general_consultation',
          quickReply: true,
          subtype: quickSubtype,
        }
      }
    }

    // 2. Off-topic Guardrail check
    const intent = await measureStage('intentClassificationMs', () =>
      detectGeneralConsultationIntent(lastUserText, lang)
    )
    if (intent.type === 'refusal') {
      const fullReplyText = await streamRefusalReply(lang, onChunk, signal, 'general_consultation')
      return {
        fullReplyText,
        memoriesUsed: [],
        performanceMeta: {
          specialty: 'general_consultation',
          refusal: true,
        }
      }
    }

    let memoryPromptBlock = ''
    let memoriesUsed = []

    if (userId && !sessionMemoryPaused) {
      try {
        const memRes = await measureStage('memoryRetrievalMs', () => getActiveMemoryContext(userId, lastUserText))
        memoryPromptBlock = memRes.promptBlock
        memoriesUsed = memRes.memoriesUsed
      } catch (e) {
        console.error('[GenerateReply] Memory retrieval error for general consultation:', e)
      }
    }

    const defaultSystemPrompt = "You are MedChat247, a specialized clinical medical AI assistant developed by the MedChat247 healthcare team.\n" +
      "- Always maintain your identity as MedChat247. NEVER mention or acknowledge underlying base models (such as Qwen, Alibaba, OpenAI, Anthropic, Google, DeepSeek, Meta).\n" +
      "- Strictly decline off-topic non-medical requests.\n" +
      "- Provide clear, coherent, and evidence-based clinical explanations in natural, well-formed paragraphs.\n" +
      "- Use Markdown selectively: bold key clinical terms, medications (e.g. **Metformin**), and important metrics (e.g. **HbA1c**). Use bullet points (-) only when genuinely enumerating multiple distinct items or recommendations. Avoid excessive line breaks or forcing unnecessary subheadings. Do NOT use emojis or icons."
    let systemPromptContent = defaultSystemPrompt
    if (memoryPromptBlock) {
      systemPromptContent += `\n\n[USER CLINICAL PROFILE]:\n${memoryPromptBlock}`
    }

    let fullReplyText = ''

    if (lang === 'vi') {
      // 1. If Vietnamese, translate user query into English using 'medchat' model from 9Router
      const userText = lastUserText || messages.filter(m => m.role === 'user').at(-1)?.content || ''
      const translatedUserText = await measureStage('queryTranslationMs', () => translateViToEn(userText, signal))

      const englishMessages = [
        { role: 'system', content: systemPromptContent },
        { role: 'user', content: translatedUserText }
      ]

      // 2. Call fine-tuned model (Modal vLLM) with stream: false to get complete English clinical response
      const englishReplyText = await measureStage('answerGenerationMs', () => callFinetunedLLM({
        messages: englishMessages,
        stream: false,
        maxTokens: 600,
        temperature: 0.3,
        signal
      }))

      // 3. Translate English response back to Vietnamese in real-time streaming directly to frontend via SSE
      fullReplyText = await measureStage('answerTranslationMs', () => translateEnToViStreaming(englishReplyText, onChunk, signal))
    } else {
      // If English, stream directly from Modal fine-tuned model to frontend via SSE
      const englishMessages = [
        { role: 'system', content: systemPromptContent },
        ...messages
      ]

      fullReplyText = await measureStage('answerGenerationMs', () => callFinetunedLLM({
        messages: englishMessages,
        stream: true,
        maxTokens: 600,
        temperature: 0.3,
        onChunk,
        signal
      }))
    }

    if (isGuest) {
      const ctaText = isEn ? GUEST_CTA.en : GUEST_CTA.vi
      await streamText(ctaText, onChunk, signal, {
        thinkingDelayMs: 80,
        tokenDelayMs: 10,
      })
      fullReplyText += ctaText
    }

    return {
      fullReplyText,
      memoriesUsed,
      performanceMeta: {
        specialty: 'general_consultation',
        model: 'qwen25-med',
        fineTuned: true,
        isGuest,
      }
    }
  }

  // 1. Static suggestions only for logged-in users (Health Consultation)
  const staticSuggestionReply = (!isGuest && specialtyId === 'health_consultation')
    ? getStaticSuggestionReply(suggestionId, lang)
    : null
  if (staticSuggestionReply) {
    const fullReplyText = await streamText(staticSuggestionReply, onChunk, signal, {
      thinkingDelayMs: 600,
      tokenDelayMs: 15,
    })
    return { fullReplyText, memoriesUsed: [], performanceMeta: { staticSuggestionReply: true } }
  }

  // ── INTENT-BASED ROUTING (Health Consultation Symptom Screener) ───────────────
  const intent = await detectIntent(lastUserText, lang)

  // Fast path: quick responses (no LLM, no GraphRAG)
  if (intent.type === 'quick') {
    const fullReplyText = await streamQuickReply(lang, intent.subtype, onChunk, signal)
    return { fullReplyText, memoriesUsed: [], performanceMeta: { intent: 'quick', subtype: intent.subtype } }
  }

  // Out-of-scope: refusal (no LLM, no GraphRAG)
  if (intent.type === 'refusal') {
    const fullReplyText = await streamRefusalReply(lang, onChunk, signal)
    return { fullReplyText, memoriesUsed: [], performanceMeta: { intent: 'refusal' } }
  }
  // SYMPTOM_QUERY: fall through to existing pipeline below
  // ─────────────────────────────────────────────────────────────────────────────

  // No API Key: hard error in production; dev-only mock via flag
  if (!env.llmApiKey) {
    const msg = '[generateReply] NINEROUTER_API is not configured. Set NINEROUTER_API in back_end/.env.'
    if (env.isProd) {
      console.error(msg)
      throw new Error('AI service is not configured. Please contact the administrator.')
    }
    console.warn(msg)
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    const fullReplyText = await streamText(buildMockReply(lastUser?.content ?? '', specialtyId, lang), onChunk, signal)
    return { fullReplyText, memoriesUsed: [], performanceMeta }
  }

  // ── GUEST MODE: Basic LLM response without Enhanced GraphRAG / Knowledge Graph / Memory ──
  if (isGuest) {
    const guestSystemPrompt = isEn
      ? `You are MedChat247, a helpful medical AI assistant providing general health consultation and symptom guidance.
Provide clear, empathetic, and professional advice. Always remind the user to consult a doctor for a definitive diagnosis.`
      : `Bạn là MedChat247, trợ lý AI y khoa hỗ trợ tư vấn sức khỏe tổng quát và định hướng triệu chứng.
Hãy cung cấp thông tin y tế hữu ích, rõ ràng và chu đáo. Luôn nhắc nhở người dùng thăm khám bác sĩ để có chẩn đoán chính xác.`

    const chatMessages = [
      { role: 'system', content: guestSystemPrompt },
      ...messages,
    ]

    const baseReplyText = await measureStage('answerGenerationMs', () => callLLM({
      messages: chatMessages,
      model: env.openrouterModelChat,
      stream: true,
      maxTokens: 1200,
      onChunk,
      signal,
    }))

    const ctaText = isEn ? GUEST_CTA.en : GUEST_CTA.vi
    await streamText(ctaText, onChunk, signal, {
      thinkingDelayMs: 80,
      tokenDelayMs: 10,
    })

    const fullReplyText = (baseReplyText || '') + ctaText
    return {
      fullReplyText,
      memoriesUsed: [],
      performanceMeta: { isGuest: true, modelMode: 'basic_llm' },
    }
  }

  // TRUE ADAPTIVE GRAPHRAG for Health Consultation specialty (LOGGED-IN USERS ONLY)
  if (specialtyId === 'health_consultation' || specialtyId === 'pediatrics') {
    let adaptiveCtx = null
    let sceResult = null
    let memoryPromptBlock = ''
    let memoriesUsed = []
    
    try {
      const userMessageCount = messages.filter((message) => message.role === 'user').length
      
      // OPTIMIZATION: Parallelize independent operations that don't depend on each other
      const [firstCtx, previousSCE, memRes] = await Promise.all([
        measureStage('loadSymptomCatalogMs', () => computeAdaptiveContext(new Set(), new Set())),
        specialtyId === 'health_consultation' ? getSCEState(conversationId, userMessageCount) : Promise.resolve(null),
        userId && !sessionMemoryPaused 
          ? measureStage('memoryRetrievalMs', () => getActiveMemoryContext(userId, lastUserText))
          : Promise.resolve({ promptBlock: '', memoriesUsed: [] })
      ])
      
      if (memRes) {
        memoryPromptBlock = memRes.promptBlock
        memoriesUsed = memRes.memoriesUsed
      }
      
      // INCREMENTAL EXTRACTION: Only extract from new messages if we have previous SCE state
      const messagesForExtraction = previousSCE
        ? [messages.filter((message) => message.role === 'user').at(-1)]
        : messages
      
      auditLog('SCE_EXTRACTION', 'Info', 
        `Extracting SCE from ${messagesForExtraction.length} message(s) - ${previousSCE ? 'incremental' : 'full'} mode`)
      
      const extractedSCE = await measureStage('symptomExtractionMs', () =>
        extractSymptomsFromHistory(messagesForExtraction, firstCtx.allSymptoms, lang),
      )
      sceResult = previousSCE ? mergeSCEState(previousSCE, extractedSCE) : extractedSCE
      if (specialtyId === 'health_consultation') {
        await setSCEState(conversationId, userMessageCount, sceResult)
      }
      adaptiveCtx = await measureStage('graphRankingMs', () => computeAdaptiveContext(sceResult))
    } catch (err) {
      auditLog('Adaptive GraphRAG', 'Error', err.message, 'error')
      throw err
    }

    const hasAge = !!(sceResult?.demographics?.age)
    const hasSex = !!(sceResult?.demographics?.sex)
    const checklistStatus = {
      hasAge,
      hasSex,
      hasAgeSex: hasAge && hasSex,
      hasDuration: !!(sceResult?.temporal?.durationValue),
      hasSeverity: !!(sceResult?.symptoms?.some(s => s.status === 'positive' && s.attributes?.severity))
    }

    const userMessages = messages.filter((m) => m.role === 'user')
    const turnCount = userMessages.length

    const phaseInfo = evaluatePhase({ checklistStatus, sceResult, turnCount, isSuggestionDemo })
    const phase = phaseInfo.phase

    const adaptiveText = adaptiveCtx
      ? formatAdaptiveContext(adaptiveCtx, lang)
      : (isEn ? '*[No graph data yet — please ask for symptoms]*' : '*[Chưa có dữ liệu đồ thị — hãy hỏi triệu chứng ban đầu]*')

    let systemPrompt = renderSystemPrompt(specialtyId, lang, {
      checklistStatus,
      phase,
      ADAPTIVE_CONTEXT: adaptiveText
    })

    if (memoryPromptBlock) {
      systemPrompt += `\n\n${memoryPromptBlock}`
    }

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    const maxTokens = phase === 1 ? 800 : 2500
    const fullReplyText = await measureStage('answerGenerationMs', () => callLLM({
      messages: chatMessages,
      model: env.openrouterModelChat,
      stream: true,
      maxTokens,
      onChunk,
      signal
    }))

    return { fullReplyText, memoriesUsed, performanceMeta }
  }

  // Other specialties (General, Dermatology, Nutrition)
  let memoryPromptBlock = ''
  let memoriesUsed = []
  
  if (userId && !sessionMemoryPaused) {
    try {
      const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || ''
      const memRes = await measureStage('memoryRetrievalMs', () => getActiveMemoryContext(userId, lastUserText))
      memoryPromptBlock = memRes.promptBlock
      memoriesUsed = memRes.memoriesUsed
    } catch (e) {
      console.error('[GenerateReply] Memory retrieval error:', e)
    }
  }
  
  let systemPrompt = renderSystemPrompt(specialtyId, lang, {})
  if (memoryPromptBlock) {
    systemPrompt += `\n\n${memoryPromptBlock}`
  }

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]
  const fullReplyText = await measureStage('answerGenerationMs', () => callLLM({
    messages: chatMessages,
    model: null,
    stream: true,
    maxTokens: 1500,
    onChunk,
    signal
  }))

  return { fullReplyText, memoriesUsed, performanceMeta }
}

export function estimateTokens(text) {
  return text ? Math.ceil(text.length / 4) : 0
}
