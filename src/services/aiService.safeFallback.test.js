import { describe, expect, it, vi } from 'vitest'
import { streamAssistantReply } from './aiService.js'

describe('streamAssistantReply', () => {
  it('returns a safe fallback message when the backend is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })

    let captured = ''
    const result = await streamAssistantReply({
      messages: [{ role: 'user', content: 'Tôi bị đau ngực' }],
      specialtyId: 'health_consultation',
      lang: 'vi',
      onToken: (chunk) => { captured += chunk },
    })

    expect(captured.length).toBeGreaterThan(0)
    expect(captured).toMatch(/cấp cứu|cơ sở y tế/)
    expect(result).toBe(captured)
  })

  it('still propagates AbortError to the caller', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })

    await expect(
      streamAssistantReply({
        messages: [{ role: 'user', content: 'hi' }],
        specialtyId: 'general',
        lang: 'en',
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('emits an English safe fallback for English sessions', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down')
    })

    let captured = ''
    await streamAssistantReply({
      messages: [{ role: 'user', content: 'Hello' }],
      specialtyId: 'general',
      lang: 'en',
      onToken: (chunk) => { captured += chunk },
    })

    expect(captured.toLowerCase()).toContain('emergency')
  })

  it('keeps __NUTRITION_DATA__ markers in the accumulated result (for MessageBubble)', async () => {
    const marker = '__NUTRITION_DATA__:{"food_name":"Chè thái","evaluation":{"overall_status":"AVOID"}}'
    const raw = 'Chè thái có lượng đường cao.\n' + marker + '\n'
    globalThis.fetch = vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(raw))
          controller.close()
        },
      }),
    ))

    let streamed = ''
    const result = await streamAssistantReply({
      messages: [{ role: 'user', content: 'Tiểu đường ăn chè thái được không?' }],
      specialtyId: 'nutrition_consultation',
      lang: 'vi',
      onToken: (chunk) => { streamed += chunk },
    })

    // Tokens are stripped so raw JSON never flashes on screen...
    expect(streamed).not.toContain('__NUTRITION_DATA__')
    // ...but the returned full text keeps the marker for MessageBubble parsing.
    expect(result).toContain('__NUTRITION_DATA__')
    expect(result).toContain('Chè thái có lượng đường cao')
  })
})
