import { env } from '../../config/env.js'
import { auditLog } from '../../utils/auditLog.js'
import { streamText } from './streaming.js'

function getReasoningConfig(modelName) {
  if (
    modelName.includes('gemini-3') ||
    modelName.includes('gemini-2.5') ||
    modelName.includes('deepseek')
  ) {
    return {
      effort: 'low',
      exclude: true
    }
  }
  return undefined
}

/**
 * Executes a streaming or non-streaming LLM request to OpenRouter/9Router or Fine-tuned vLLM.
 */
export async function callLLM({
  messages,
  model = null,
  stream = false,
  maxTokens = 1500,
  temperature = undefined,
  timeoutMs = 35000,
  onChunk = null,
  signal = null,
  baseUrl = null,
  apiKey = null,
}) {
  const modelName = model || env.openrouterModel

  const signals = []
  if (signal) signals.push(signal)
  if (timeoutMs) signals.push(AbortSignal.timeout(timeoutMs))
  const effectiveSignal = signals.length > 1 ? AbortSignal.any(signals) : (signals[0] || null)

  const targetBaseUrl = (baseUrl || env.llmBaseUrl).replace(/\/+$/, '')
  const targetApiKey = apiKey || env.llmApiKey

  const requestBody = {
    model: modelName,
    messages,
    stream,
    max_tokens: maxTokens,
  }
  if (temperature !== undefined) {
    requestBody.temperature = temperature
  }
  const reasoning = getReasoningConfig(modelName)
  if (reasoning) {
    requestBody.reasoning = reasoning
  }

  const response = await fetch(`${targetBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${targetApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.clientOrigin,
      'X-Title': 'MedChat247'
    },
    body: JSON.stringify(requestBody),
    signal: effectiveSignal
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`LLM API error (${targetBaseUrl}): ${response.status} - ${errText}`)
  }

  if (stream) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullReply = ''
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          const clean = line.trim()
          if (!clean || clean === 'data: [DONE]') continue
          const match = clean.match(/^data:\s*(.+)$/)
          if (match) {
            try {
              const parsed = JSON.parse(match[1])
              const content = parsed.choices?.[0]?.delta?.content ?? ''
              if (content) {
                fullReply += content
                onChunk?.(content)
              }
            } catch {
              /* ignore incomplete stream lines */
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    return fullReply
  } else {
    const data = await response.json()
    if (data.error) {
      throw new Error(`OpenRouter API error: ${data.error.message || JSON.stringify(data.error)}`)
    }
    const content = data.choices?.[0]?.message?.content
    if (content === undefined || content === null) {
      auditLog('LLM_TRANSLATION', 'Warning', `Empty choices content from OpenRouter: ${JSON.stringify(data)}`, 'warn')
    }
    return content ?? ''
  }
}

/**
 * Executes an LLM call with active failover model fallback.
 */
export async function callLLMWithFailover({
  messages,
  model = null,
  fallbackModel = null,
  maxTokens = 2000,
  timeoutMs = 35000,
  fallbackTimeoutMs = 20000
}) {
  if (!env.llmApiKey) return ''

  const primaryModel = model || env.openrouterModel
  const prefix = primaryModel.includes('/') ? primaryModel.split('/')[0] : 'google'
  const defaultFallback = fallbackModel || `${prefix}/gemini-2.5-flash`

  try {
    auditLog('LLM_TRANSLATION', 'Info', `Calling primary model: "${primaryModel}"`)
    return await callLLM({
      messages,
      model: primaryModel,
      stream: false,
      maxTokens,
      timeoutMs
    })
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('aborted') || err.message?.includes('Timeout')
    auditLog(
      'LLM_TRANSLATION',
      'Warning',
      `Primary model "${primaryModel}" failed (${isTimeout ? 'Timeout' : err.message}). Retrying with defensive fallback model "${defaultFallback}"...`,
      'warn'
    )

    try {
      return await callLLM({
        messages,
        model: defaultFallback,
        stream: false,
        maxTokens,
        timeoutMs: fallbackTimeoutMs
      })
    } catch (fallbackErr) {
      auditLog('LLM_TRANSLATION', 'Error', `Fallback model "${defaultFallback}" also failed: ${fallbackErr.message}`, 'error')
      throw new Error(`Cả model chính và phòng thủ đều lỗi. Model chính: ${err.message}. Model phòng thủ: ${fallbackErr.message}`)
    }
  }
}

/**
 * Executes an LLM call to the custom Fine-tuned Medical Model (Modal vLLM)
 * with automatic defensive failover to the primary chat model if Modal is unavailable.
 */
export async function callFinetunedLLM({
  messages,
  stream = false,
  maxTokens = 600,
  temperature = 0.3,
  timeoutMs = 60000,
  fallbackModel = null,
  onChunk = null,
  signal = null,
}) {
  const baseUrl = env.finetuneLlmBaseUrl || 'https://huyphuhunghuyfb--medchat247-backend-serve-vllm.modal.run/v1'
  const apiKey = env.finetuneLlmApiKey || 'medchat247-secret-key-2026'

  let chunksEmitted = 0
  const trackingOnChunk = onChunk
    ? (chunk) => {
        chunksEmitted++
        onChunk(chunk)
      }
    : null

  try {
    auditLog('FINE_TUNED_LLM', 'Info', `Calling Modal vLLM fine-tuned model "qwen25-med" at ${baseUrl}`)
    return await callLLM({
      messages,
      model: 'qwen25-med',
      stream,
      maxTokens,
      temperature,
      timeoutMs,
      baseUrl,
      apiKey,
      onChunk: trackingOnChunk,
      signal,
    })
  } catch (err) {
    // If client aborted (e.g. Stop button), do not trigger fallback
    if (signal?.aborted || err.name === 'AbortError') {
      throw err
    }

    // If chunks were already partially emitted to client, do not silently restart from beginning
    if (chunksEmitted > 0) {
      auditLog('FINE_TUNED_LLM', 'Error', `Modal vLLM stream interrupted after ${chunksEmitted} chunks. Cannot failover cleanly.`, 'error')
      throw err
    }

    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('aborted') || err.message?.includes('Timeout')
    auditLog(
      'FINE_TUNED_LLM',
      'Warning',
      `Modal vLLM model failed (${isTimeout ? 'Timeout' : err.message}). Retrying with defensive fallback model...`,
      'warn'
    )

    // Defensive fallback to primary chat model
    return await callLLM({
      messages,
      model: fallbackModel || env.openrouterModelChat,
      stream,
      maxTokens,
      timeoutMs: 30000,
      onChunk,
      signal,
    })
  }
}

/**
 * Translates a Vietnamese medical query to English using the 'medchat' model via 9Router.
 */
export async function translateViToEn(text, signal = null) {
  if (!text || !text.trim()) return text

  try {
    const translationMessages = [
      {
        role: 'system',
        content: 'You are a professional medical translator. Translate the following Vietnamese clinical question accurately and fluently into English. Preserve all clinical terms, symptom descriptions, lab numbers, and medical context without adding any preamble. Output ONLY the English translation.'
      },
      {
        role: 'user',
        content: text
      }
    ]

    const translated = await callLLM({
      messages: translationMessages,
      model: env.openrouterModelChat || 'medchat',
      stream: false,
      maxTokens: 500,
      temperature: 0.1,
      timeoutMs: 20000,
      signal
    })

    return (translated || '').trim() || text
  } catch (err) {
    auditLog('LLM_TRANSLATION', 'Warning', `translateViToEn failed (${err.message}), using original query.`, 'warn')
    return text
  }
}

/**
 * Translates an English medical answer to Vietnamese in real-time streaming using the 'medchat' model via 9Router.
 */
export async function translateEnToViStreaming(englishText, onChunk, signal = null) {
  if (!englishText || !englishText.trim()) return englishText

  try {
    const translationMessages = [
      {
        role: 'system',
        content: `Bạn là chuyên gia biên tập và dịch thuật y văn lâm sàng của MedChat247.
Hãy dịch câu trả lời y tế tiếng Anh dưới đây sang tiếng Việt chuẩn xác, văn phong mạch lạc và trình bày với bố cục Markdown chuyên nghiệp, thanh lịch:

1. PHÂN CẤP TIÊU ĐỀ RÕ RÀNG (Headers):
   - Sử dụng tiêu đề cấp 3 (###) cho các phần nội dung lớn (ví dụ: ### 1. Can thiệp lối sống, ### 2. Khuyến nghị điều trị bằng thuốc, ### 3. Lưu ý & Theo dõi chuyên môn).

2. BÔI ĐẬM CÓ CHỌN LỌC (Chỉ bôi đậm đầu mục, KHÔNG bôi đậm tràn lan):
   - Khi dùng gạch đầu dòng (-), CHỈ bôi đậm cụm từ tiêu đề ở đầu mỗi ý (ví dụ: "- **Giảm cân:** Giúp cải thiện độ nhạy insulin và giảm glucose máu.").
   - TUYỆT ĐỐI KHÔNG bôi đậm các từ ngữ giải thích rải rác bên trong câu (như KHÔNG bôi đậm **carbohydrate**, **chất xơ**, **tân tạo glucose**... vì gây rối mắt).
   - Tên thuốc chính (ví dụ **Metformin**) và chỉ số (ví dụ **HbA1c**) có thể bôi đậm để làm nổi bật.

3. TRÌNH BÀY GỌN GÀNG, KHÔNG TÁCH DÒNG RỜI RẠC:
   - Các nhóm thuốc bổ trợ hãy gom chung vào 1 dòng súc tích (ví dụ: "- **Các nhóm thuốc bổ trợ:** Sulfonylureas, ức chế DPP-4, đồng vận GLP-1 RA, ức chế SGLT-2 (cân nhắc theo bệnh nền tim mạch/thận)."), tránh tách mỗi tên thuốc thành một dòng gạch đầu dòng trống trải.

4. BẢO ĐẢM TÍNH CHUYÊN NGHIỆP:
   - TUYỆT ĐỐI KHÔNG sử dụng icon hay emoji (💊, ⏰, ⚠️...).
   - TUYỆT ĐỐI KHÔNG thêm lời giải thích hay dẫn nhập ngoài lề, chỉ xuất bản dịch tiếng Việt có cấu trúc Markdown hoàn chỉnh.`
      },
      {
        role: 'user',
        content: englishText
      }
    ]

    const translated = await callLLM({
      messages: translationMessages,
      model: env.openrouterModelChat || 'medchat',
      stream: true,
      maxTokens: 1200,
      temperature: 0.2,
      timeoutMs: 40000,
      onChunk,
      signal
    })

    return translated || englishText
  } catch (err) {
    auditLog('LLM_TRANSLATION', 'Warning', `translateEnToViStreaming failed (${err.message}), streaming original English text.`, 'warn')
    await streamText(englishText, onChunk, signal)
    return englishText
  }
}


