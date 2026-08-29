const THINKING_DELAY_RANGE = [300, 700]
const TOKEN_DELAY_RANGE = [10, 28]

export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    })
  })
}

export function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

export async function streamText(text, onChunk, signal, { thinkingDelayMs, tokenDelayMs } = {}) {
  await wait(thinkingDelayMs ?? randomBetween(...THINKING_DELAY_RANGE), signal)
  // Split by Unicode tokens / words to safely preserve surrogate pairs, emojis, and Vietnamese diacritics
  const chunks = text.match(/\S+\s*|\s+/gu) ?? [text]
  let full = ''
  for (const chunk of chunks) {
    full += chunk
    onChunk?.(chunk)
    await wait(tokenDelayMs ?? randomBetween(...TOKEN_DELAY_RANGE), signal)
  }
  return full
}
