import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createId } from '../utils/id'
import { streamAssistantReply, fetchSmartTitle } from '../services/aiService'
import { apiUrl } from '../services/api'
import { DEFAULT_SPECIALTY_ID, NUTRITION_SPECIALTY_ID } from '../data/specialties'

const ACTIVE_CHAT_STORAGE_KEY = 'medai_active_chat_id'
const NUTRITION_CONDITIONS_STORAGE_KEY = 'medai_nutrition_conditions'

function makeConversation(specialtyId = DEFAULT_SPECIALTY_ID) {
  return {
    id: createId(),
    title: 'Cuộc trò chuyện mới',
    specialtyId,
    messages: [],
    createdAt: Date.now(),
  }
}

function titleFromText(text) {
  const cleaned = text
    .replace(/\[.*?\]/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= 25) return cleaned
  return `${cleaned.slice(0, 25)}…`
}

export function useChat(account) {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY) || null)
  const [isResponding, setIsResponding] = useState(false)
  const [nutritionConditions, setNutritionConditions] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(NUTRITION_CONDITIONS_STORAGE_KEY) || '[]')
      return Array.isArray(raw) ? raw : []
    } catch {
      return []
    }
  })
  const abortRef = useRef(null)
  // Mirror of the latest conversations state so async callbacks can read fresh
  // data without performing side effects inside setState updaters (which
  // double-fire under React StrictMode).
  const conversationsRef = useRef(conversations)
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  // Abort any in-flight stream when the hook unmounts.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Pills bệnh nền cho chuyên khoa Dinh dưỡng (đa chọn, lưu localStorage).
  const toggleNutritionCondition = useCallback((conditionId) => {
    setNutritionConditions((prev) => {
      const next = prev.includes(conditionId)
        ? prev.filter((c) => c !== conditionId)
        : [...prev, conditionId]
      localStorage.setItem(NUTRITION_CONDITIONS_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // Lưu activeId vào state & localStorage (chỉ khi có id hợp lệ)
  const setActiveIdAndPersist = useCallback((id) => {
    setActiveId(id)
    if (id) {
      localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY)
    }
  }, [])

  // Load conversations từ MongoDB khi tài khoản đã xác thực
  useEffect(() => {
    if (!account) {
      setConversations([])
      return
    }

    let cancelled = false
    fetch(apiUrl('/api/chat/conversations'), { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then((data) => {
        if (cancelled || !data.conversations) return
        // Never wipe local conversations that already carry user content —
        // a slow server response must not discard messages typed meanwhile.
        const hasLocalContent = conversationsRef.current.some((c) => c.messages.length > 0)
        if (hasLocalContent && conversationsRef.current.length > 0) {
          console.warn('Bỏ qua tải lịch sử: có hội thoại cục bộ chưa được lưu.')
          return
        }
        setConversations(data.conversations)
        if (data.conversations.length > 0) {
          const savedId = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY)
          const exists = data.conversations.some((c) => c.id === savedId)
          if (savedId && exists) {
            setActiveId(savedId)
          } else {
            setActiveIdAndPersist(data.conversations[0].id)
          }
        }
      })
      .catch((err) => {
        console.error('Không thể tải lịch sử trò chuyện:', err)
      })

    return () => {
      cancelled = true
    }
  }, [account, setActiveIdAndPersist])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  const persistConversation = useCallback((conv, lang) => {
    if (!account || !conv) return
    fetch(apiUrl('/api/chat/conversations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id: conv.id,
        title: conv.title,
        specialtyId: conv.specialtyId,
        messages: conv.messages,
        lang,
      }),
    }).catch((err) => console.error('Không thể lưu cuộc trò chuyện:', err))
  }, [account])

  const startNewConversation = useCallback((specialtyId) => {
    const conv = makeConversation(specialtyId)
    setConversations((prev) => [conv, ...prev])
    setActiveIdAndPersist(conv.id)
    return conv.id
  }, [setActiveIdAndPersist])

  const selectConversation = useCallback((id) => {
    setActiveIdAndPersist(id)
  }, [setActiveIdAndPersist])

  const deleteConversation = useCallback((id) => {
    const remaining = conversationsRef.current.filter((c) => c.id !== id)
    setConversations(remaining)
    const currentSaved = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY)
    if (currentSaved === id || activeId === id) {
      const nextActive = remaining.length > 0 ? remaining[0].id : null
      setActiveIdAndPersist(nextActive)
    }
    if (account) {
      fetch(apiUrl(`/api/chat/conversations/${id}`), { method: 'DELETE', credentials: 'include' }).catch((err) =>
        console.error('Không thể xóa cuộc trò chuyện:', err),
      )
    }
  }, [account, activeId, setActiveIdAndPersist])

  const setSpecialty = useCallback((convId, specialtyId) => {
    const updated = conversationsRef.current.map((c) => (c.id === convId ? { ...c, specialtyId } : c))
    setConversations(updated)
    persistConversation(updated.find((c) => c.id === convId), undefined)
  }, [persistConversation])

  const stopResponding = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const sendMessage = useCallback(
    async (text, specialtyIdForNew, lang = 'vi', suggestionId = null) => {
      const trimmed = text.trim()
      if (!trimmed || isResponding) return

      let convId = activeId
      let baseMessages = activeConversation?.messages ?? []
      let specialtyId = activeConversation?.specialtyId ?? specialtyIdForNew ?? DEFAULT_SPECIALTY_ID

      if (!convId) {
        const conv = makeConversation(specialtyIdForNew)
        convId = conv.id
        specialtyId = conv.specialtyId
        baseMessages = []
        setActiveIdAndPersist(convId)
      }

      const userMessage = { id: createId(), role: 'user', content: trimmed }
      const assistantId = createId()
      const assistantMessage = { id: assistantId, role: 'assistant', content: '', streaming: true }
      const messagesForApi = [...baseMessages, userMessage]

      // Thêm cuộc hội thoại và tin nhắn đồng bộ vào state
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === convId)
        if (!exists) {
          const newConv = {
            id: convId,
            title: titleFromText(trimmed),
            specialtyId,
            messages: [userMessage, assistantMessage],
            createdAt: Date.now(),
          }
          return [newConv, ...prev]
        }

        return prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: c.messages.length === 0 ? titleFromText(trimmed) : c.title,
                messages: [...c.messages, userMessage, assistantMessage],
              }
            : c,
        )
      })

      // Nếu là câu thoại đầu tiên của đoạn chat, tự động tạo tiêu đề ChatGPT súc tích
      if (baseMessages.length === 0) {
        const targetConvId = convId
        fetchSmartTitle(trimmed, lang).then((smartTitle) => {
          if (!smartTitle) return
          setConversations((prev) =>
            prev.map((c) => (c.id === targetConvId ? { ...c, title: smartTitle } : c)),
          )
          const conv = conversationsRef.current.find((c) => c.id === targetConvId)
          persistConversation(conv ? { ...conv, title: smartTitle } : null, lang)
        })
      }

      const controller = new AbortController()
      abortRef.current = controller
      setIsResponding(true)

      const appendToken = (chunk) => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + chunk } : m,
                  ),
                }
              : c,
          ),
        )
      }

      let finalText = null
      try {
        finalText = await streamAssistantReply({
          messages: messagesForApi,
          specialtyId,
          lang,
          isSuggestionDemo: !!suggestionId,
          suggestionId,
          conversationId: specialtyId === DEFAULT_SPECIALTY_ID ? convId : undefined,
          conditions: specialtyId === NUTRITION_SPECIALTY_ID ? nutritionConditions : undefined,
          signal: controller.signal,
          onToken: appendToken,
        })
      } catch (err) {
        if (err?.name !== 'AbortError') {
          appendToken(lang === 'en' ? '\n\n_An error occurred while fetching the response. Please try again._' : '\n\n_Đã xảy ra lỗi khi lấy phản hồi. Vui lòng thử lại._')
        }
      } finally {
        // Authoritative final content: the streamed tokens are stripped of
        // control markers, but the returned full text keeps them
        // (__NUTRITION_DATA__, __MEMORIES_USED__, [SymptomChecklist]) so
        // MessageBubble can parse and render the rich blocks after streaming.
        if (typeof finalText === 'string' && finalText.length > 0) {
          const withFinal = conversationsRef.current.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: finalText } : m,
                  ),
                }
              : c,
          )
          setConversations(withFinal)
          conversationsRef.current = withFinal
        }

        // Stream is over — safe to compute the final array outside an updater.
        const updated = conversationsRef.current.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId ? { ...m, streaming: false } : m,
                ),
              }
            : c,
        )
        setConversations(updated)

        // CHỈ LƯU VÀO MONGODB KHI TÀI KHOẢN ĐÃ ĐĂNG NHẬP (ACCOUNT != NULL)
        persistConversation(updated.find((c) => c.id === convId), lang)

        setIsResponding(false)
        abortRef.current = null
      }
    },
    [activeId, activeConversation, isResponding, nutritionConditions, persistConversation, setActiveIdAndPersist],
  )

  return {
    conversations,
    activeId,
    activeConversation,
    isResponding,
    sendMessage,
    stopResponding,
    startNewConversation,
    selectConversation,
    deleteConversation,
    setSpecialty,
    nutritionConditions,
    toggleNutritionCondition,
  }
}
