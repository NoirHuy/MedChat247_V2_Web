import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { attachUserIfPresent, requireAuth } from '../middleware/auth.js'
import {
  guestChatLimiter,
  memberChatLimiter,
  chatTitleLimiter,
  chatGeneralLimiter,
} from '../middleware/rateLimiters.js'
import { generateReply, estimateTokens } from '../services/chat/generateReply.js'
import { generateSmartTitle } from '../services/chat/generateSmartTitle.js'
import { stripNutritionMarker } from '../services/chat/nutritionGateway.js'
import { incrementUsage, reserveUsage, findUserById } from '../db/usersRepo.js'
import { getPlan } from '../config/plans.js'
import { ConversationModel } from '../db/conversation.model.js'
import { SystemLogModel } from '../db/systemLog.model.js'
import { runMemoryExtractionPass } from '../services/memory/memoryExtractor.js'

const router = Router()
const MAX_MESSAGES = 40
const MAX_MESSAGE_LENGTH = 6000
export const MAX_CONVERSATION_CHARACTERS = 24000
// Nutrition assistant messages embed the __NUTRITION_DATA__ card JSON
// (~2-4 KB per turn) so the stored conversation needs a larger ceiling.
const MAX_NUTRITION_CONVERSATION_CHARACTERS = 96000
const MAX_OUTPUT_TOKENS = 2500

export function validateMessages(messages, maxChars = MAX_CONVERSATION_CHARACTERS) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, 'Missing conversation messages.')
  }
  if (messages.length > MAX_MESSAGES) {
    throw new HttpError(400, `A conversation cannot exceed ${MAX_MESSAGES} messages.`)
  }

  let totalLength = 0
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      throw new HttpError(400, 'Invalid message format.')
    }
    if (message.content.length > MAX_MESSAGE_LENGTH) {
      throw new HttpError(400, `Each message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`)
    }
    totalLength += message.content.length
  }
  if (totalLength > maxChars) {
    throw new HttpError(400, 'Conversation content exceeds the allowed limit.')
  }
}

export async function reserveChatQuota(userId, messages) {
  if (!userId) return null

  const user = await findUserById(userId)
  if (!user) throw new HttpError(401, 'Phiên đăng nhập không còn hợp lệ.')

  const plan = getPlan(user.planId)
  const inputTokens = estimateTokens(messages.map((message) => message.content).join('')) + 3200
  const reservedTokens = inputTokens + MAX_OUTPUT_TOKENS
  const updatedUser = await reserveUsage(userId, plan.tokenLimit, reservedTokens)

  if (!updatedUser) {
    throw new HttpError(429, 'Bạn đã sử dụng hết hạn mức AI của gói hiện tại. Vui lòng nâng cấp hoặc chờ chu kỳ tiếp theo.')
  }

  return { inputTokens, reservedTokens }
}

// Endpoint tự động tạo tiêu đề ChatGPT (2-4 từ súc tích) dựa trên ý chính câu thoại
router.post(
  '/generate-title',
  chatTitleLimiter,
  asyncHandler(async (req, res) => {
    const { text, lang } = req.body ?? {}
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) {
      throw new HttpError(400, 'Title input must be between 1 and 1000 characters.')
    }
    const title = await generateSmartTitle(text, lang || 'vi')
    res.json({ title })
  })
)

// Chat works for guests too (no requireAuth) — attachUserIfPresent identifies user
router.post(
  '/',
  attachUserIfPresent,
  guestChatLimiter,
  memberChatLimiter,
  asyncHandler(async (req, res) => {
    const { messages, specialtyId, lang, isSuggestionDemo, suggestionId, sessionMemoryPaused, conversationId, conditions } = req.body ?? {}
    if (typeof specialtyId !== 'string' || !specialtyId) {
      throw new HttpError(400, 'Thiếu specialtyId.')
    }
    // Nutrition chronic-condition pills (DIABETES, HYPERTENSION, GOUT, CKD_*, DYSLIPIDEMIA...)
    const nutritionConditions = Array.isArray(conditions)
      ? conditions.filter((c) => typeof c === 'string' && c.trim()).slice(0, 10).map((c) => c.trim())
      : []
    // Nutrition history carries __NUTRITION_DATA__ card JSON in assistant
    // messages — strip it for the chat call so long conversations don't trip
    // the size limit (the Flask engine only reads the last user message).
    const isNutritionChat = specialtyId === 'nutrition_consultation' && Array.isArray(messages)
    const chatMessages = isNutritionChat
      ? messages.map((m) =>
          m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('__NUTRITION_DATA__:')
            ? { ...m, content: stripNutritionMarker(m.content) || '[Thẻ dữ liệu dinh dưỡng]' }
            : m,
        )
      : messages
    // validateMessages đã bao phủ kiểm tra mảng rỗng / định dạng / giới hạn độ dài.
    validateMessages(chatMessages)

    const quotaReservation = await reserveChatQuota(req.userId, chatMessages)

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    req.socket.setKeepAlive(true)
    req.socket.setTimeout(0)

    // CRITICAL: Headers to force streaming (disable all buffering)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, no-transform')
    res.setHeader('X-Accel-Buffering', 'no') // Nginx
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Connection', 'keep-alive')
    // Prevent proxy/gateway compression to avoid buffering
    res.setHeader('X-Accel-Encoding', 'identity')
    res.setHeader('Content-Encoding', 'identity')
    
    // Flush headers immediately to force streaming start
    res.flushHeaders()

    let full = ''
    let memoriesUsed = []
    let performanceMeta = {}
    let chatCompleted = false
    const start = performance.now()
    try {
      const replyRes = await generateReply({
        messages: chatMessages,
        specialtyId,
        lang: lang || 'vi',
        isSuggestionDemo: !!isSuggestionDemo,
        suggestionId: typeof suggestionId === 'string' ? suggestionId : null,
        userId: req.userId || null,
        sessionMemoryPaused: !!sessionMemoryPaused,
        conversationId: specialtyId === 'health_consultation' ? conversationId || null : null,
        conditions: nutritionConditions,
        signal: controller.signal,
        onChunk: (chunk) => {
          res.write(chunk)
          if (typeof res.flush === 'function') res.flush()
        },
      })

      full = replyRes.fullReplyText || ''
      memoriesUsed = replyRes.memoriesUsed || []
      performanceMeta = replyRes.performanceMeta || {}
      chatCompleted = true

      if (memoriesUsed.length > 0) {
        res.write(`\n__MEMORIES_USED__:${JSON.stringify(memoriesUsed)}\n`)
      }

      const durationMs = Math.round(performance.now() - start)
      
      const messagesText = chatMessages.reduce((acc, m) => acc + (m.content || ''), '')
      const inputTokens = quotaReservation?.inputTokens ?? estimateTokens(messagesText) + 3200
      const outputTokens = estimateTokens(full)
      const totalTokens = inputTokens + outputTokens
      const costUsd = (inputTokens * 0.000075 / 1000) + (outputTokens * 0.0003 / 1000)

      const log = new SystemLogModel({
        id: randomUUID(),
        type: 'perf',
        message: `Phản hồi AI thành công trong ${durationMs}ms`,
        meta: {
          userId: req.userId || 'guest',
          specialtyId,
          durationMs,
          inputTokens,
          outputTokens,
          totalTokens,
          costUsd,
          ...performanceMeta,
          lang: lang || 'vi'
        }
      })
      await log.save()

    } catch (err) {
      const isAbort = err.name === 'AbortError' || err.message === 'aborted' || controller.signal.aborted
      if (!isAbort) {
        // Do not expose provider, network, or infrastructure errors to users.
        err.message = 'AI service is temporarily unavailable.'
        console.error('[API CHAT Error]', err)
        res.write(`\n\n⚠️ **Cảnh báo hệ thống:** Mất kết nối y khoa (${err.message}). Vui lòng kiểm tra lại cấu hình API hoặc đường truyền mạng của bạn.`)
        
        const logErr = new SystemLogModel({
          id: randomUUID(),
          type: 'error',
          message: `Lỗi kết nối API Chat: ${err.message}`,
          meta: {
            userId: req.userId || 'guest',
            specialtyId,
            error: err.name || 'UnknownError'
          }
        })
        await logErr.save()
      }
    }

    if (req.userId) {
      const lastUserMessage = [...chatMessages].reverse().find((m) => m.role === 'user')
      const tokens = quotaReservation
        ? quotaReservation.inputTokens + estimateTokens(full)
        : estimateTokens(lastUserMessage?.content ?? '') + estimateTokens(full)
      if (quotaReservation) {
        const finalUsage = chatCompleted ? tokens : 0
        await incrementUsage(req.userId, finalUsage - quotaReservation.reservedTokens)
      } else if (chatCompleted) {
        await incrementUsage(req.userId, tokens)
      }

      if (chatCompleted && !sessionMemoryPaused && full) {
        // Nutrition replies are pure __NUTRITION_DATA__ markers — feed the
        // extractor the human-readable text instead of raw JSON.
        const assistantContentForMemory =
          stripNutritionMarker(full) || '[Đã trả lời bằng thẻ dữ liệu dinh dưỡng]'
        setImmediate(async () => {
          try {
            await runMemoryExtractionPass({
              userId: req.userId,
              conversationId: conversationId || randomUUID(),
              messages: [...chatMessages, { role: 'assistant', content: assistantContentForMemory }],
            })
          } catch (passErr) {
            console.error('[Background Memory Extraction] Error (isolated):', passErr)
          }
        })
      }
    }

    res.end()
  }),
)

// Get all conversations for the logged-in user
router.get(
  '/conversations',
  requireAuth,
  chatGeneralLimiter,
  asyncHandler(async (req, res) => {
    const list = await ConversationModel.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .lean()
    res.json({ conversations: list })
  })
)

// Conversations are server-side data and must always be owned by an account.
router.post(
  '/conversations',
  requireAuth,
  chatGeneralLimiter,
  asyncHandler(async (req, res) => {
    const { id, title, specialtyId, messages, lang, responseTimeMs, symptomsMatched } = req.body ?? {}
    if (typeof id !== 'string' || !id || typeof title !== 'string' || !title.trim() || typeof specialtyId !== 'string' || !specialtyId || !Array.isArray(messages)) {
      throw new HttpError(400, 'Thiếu thông tin hội thoại.')
    }

    // Nutrition conversations embed nutrition-card JSON in assistant messages
    // (needed to re-render NutritionCard on reload) → larger storage ceiling.
    validateMessages(
      messages,
      specialtyId === 'nutrition_consultation'
        ? MAX_NUTRITION_CONVERSATION_CHARACTERS
        : MAX_CONVERSATION_CHARACTERS,
    )

    const existing = await ConversationModel.findOne({ id }).select({ userId: 1 }).lean()
    if (existing && existing.userId !== req.userId) {
      throw new HttpError(404, 'Conversation not found.')
    }

    const emergencyKeywords = ['cấp cứu', 'khẩn cấp', 'nguy hiểm', 'bác sĩ ngay', 'nhập viện', 'tử vong', 'dữ dội', 'đau nhói ngực', 'khó thở', 'emergency', 'hospit']
    const warningKeywords = ['theo dõi', 'chú ý', 'bác sĩ', 'khám', 'sớm', 'watch out', 'see a doctor', 'consult']
    
    let urgency = 'normal'
    for (const m of messages) {
      if (m.role === 'assistant') {
        const contentLower = m.content.toLowerCase()
        if (emergencyKeywords.some(k => contentLower.includes(k))) {
          urgency = 'emergency'
          break
        } else if (warningKeywords.some(k => contentLower.includes(k))) {
          urgency = 'warning'
        }
      }
    }

    const formattedMessages = messages.map((m, idx) => ({
      id: m.id || `${Date.now()}_${idx}`,
      role: m.role || 'user',
      content: m.content || '',
    }))

    const conversation = await ConversationModel.findOneAndUpdate(
      { id, userId: req.userId },
      {
        $set: {
          userId: req.userId,
          title: title.trim().slice(0, 200),
          specialtyId,
          messages: formattedMessages,
          urgency,
          lang: lang || 'vi',
          isGuest: false,
          responseTimeMs: responseTimeMs || 0,
          symptomsMatched: symptomsMatched || []
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean()

    res.json({ conversation })
  })
)

// Delete a conversation
router.delete(
  '/conversations/:id',
  requireAuth,
  chatGeneralLimiter,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const result = await ConversationModel.deleteOne({ id, userId: req.userId })
    if (result.deletedCount === 0) {
      throw new HttpError(404, 'Không tìm thấy cuộc hội thoại hoặc không có quyền xóa.')
    }
    res.json({ ok: true })
  })
)

export default router
