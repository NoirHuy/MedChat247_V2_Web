import { env } from '../../config/env.js'
import { auditLog } from '../../utils/auditLog.js'

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
 * Executes a streaming or non-streaming LLM request to OpenRouter.
 */
export async function callLLM({
  messages,
  model = null,
  stream = false,
  maxTokens = 1500,
  timeoutMs = 35000,
  onChunk = null,
  signal = null
}) {
  const modelName = model || env.openrouterModel
  const effectiveSignal = signal || (timeoutMs ? AbortSignal.timeout(timeoutMs) : null)

  const response = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.llmApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:4000',
      'X-Title': 'MedChat247'
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      stream,
      max_tokens: maxTokens,
      reasoning: getReasoningConfig(modelName)
    }),
    signal: effectiveSignal
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${errText}`)
  }

  if (stream) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullReply = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        const clean = line.trim()
        if (!clean || clean === 'data: [DONE]') continue
        if (clean.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(clean.slice(6))
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
