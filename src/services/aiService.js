import { apiUrl } from './api'

export async function fetchSmartTitle(text, lang = 'vi') {
  try {
    const res = await fetch(apiUrl('/api/chat/generate-title'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.title) return data.title
    }
  } catch (err) {
    console.warn('Failed to fetch smart title:', err)
  }
  return text.trim().slice(0, 30)
}

export async function streamAssistantReply({ messages, specialtyId, lang, isSuggestionDemo, suggestionId, conversationId, sessionMemoryPaused, conditions, signal, onToken }) {
  try {
    return await streamFromBackend({ messages, specialtyId, lang, isSuggestionDemo, suggestionId, conversationId, sessionMemoryPaused, conditions, signal, onToken })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('Chat API unavailable:', err)

    if (err.customMessage) {
      onToken?.(err.customMessage)
      return err.customMessage
    }

    const message = lang === 'en'
      ? 'The medical consultation service is temporarily unavailable. If you have severe or worsening symptoms, contact local emergency services or seek urgent in-person care.'
      : 'Dịch vụ tư vấn y tế hiện tạm thời không khả dụng. Nếu bạn có triệu chứng nặng hoặc diễn tiến xấu, hãy gọi cấp cứu địa phương hoặc đến cơ sở y tế gần nhất.'
    onToken?.(message)
    return message
  }
}

async function streamFromBackend({ messages, specialtyId, lang, isSuggestionDemo, suggestionId, conversationId, sessionMemoryPaused, conditions, signal, onToken }) {
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({ messages, specialtyId, lang, isSuggestionDemo, suggestionId, conversationId, sessionMemoryPaused, conditions }),
  })

  if (!res.ok) {
    let errorMsg = ''
    try {
      const data = await res.json()
      errorMsg = data?.error || data?.message
    } catch {
      // ignore JSON parse error
    }
    const err = new Error(errorMsg || `Chat API request failed (${res.status})`)
    err.status = res.status
    err.customMessage = errorMsg
    throw err
  }

  if (!res.body) throw new Error('Chat API response body is empty')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  // Strip server-side control sequences so they never flash as raw text during streaming.
  // They're still accumulated in `full` and parsed by MessageBubble after streaming ends.
  // __NUTRITION_DATA__ carries the structured nutrition card JSON (specialty nutrition_consultation).
  const CONTROL_MARKER_RE = /(__MEMORIES_USED__:[\s\S]*$|__NUTRITION_DATA__:[\s\S]*$|\[SymptomChecklist:[\s\S]*?\])/g

  const emitVisible = (text) => {
    if (!onToken || !text) return
    const visible = text.replace(CONTROL_MARKER_RE, '')
    if (visible) onToken(visible)
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (!chunk) continue
      full += chunk
      // Emit immediately for real-time streaming
      emitVisible(chunk)
    }

    const finalChunk = decoder.decode()
    if (finalChunk) {
      full += finalChunk
      emitVisible(finalChunk)
    }
  } finally {
    reader.releaseLock()
  }
  return full
}
