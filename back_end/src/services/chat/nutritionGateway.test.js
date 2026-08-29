import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('../../config/env.js', () => ({
  env: {
    isProd: false,
    nutritionServiceUrl: 'http://nutrition:5000',
    nutritionTimeoutMs: 5000,
  },
}))

vi.mock('../llm/streaming.js', () => ({
  streamText: vi.fn(async (text, onChunk) => {
    if (onChunk) onChunk(text)
    return text
  }),
}))

import {
  streamNutritionReply,
  stripNutritionMarker,
  isNutritionSpecialty,
} from './nutritionGateway.js'

describe('nutritionGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
  })

  it('detects the nutrition specialty id', () => {
    expect(isNutritionSpecialty('nutrition_consultation')).toBe(true)
    expect(isNutritionSpecialty('health_consultation')).toBe(false)
  })

  it('wraps structured_data into the __NUTRITION_DATA__ marker with llm_note', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply_text:
          'Chào bạn! Với người tiểu đường, chè thái chứa lượng đường đơn cao cần lưu ý kiểm soát. Bạn nên ăn một phần nhỏ và theo dõi đường huyết.',
        structured_data: {
          food_name: 'Chè thái',
          energy_kcal: 250,
          evaluation: { overall_status: 'MODERATE' },
        },
      }),
    })
    const chunks = []
    const res = await streamNutritionReply({
      messages: [{ role: 'user', content: 'Tiểu đường ăn chè thái được không?' }],
      conditions: ['DIABETES'],
      onChunk: (c) => chunks.push(c),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://nutrition:5000/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          message: 'Tiểu đường ăn chè thái được không?',
          conditions: ['DIABETES'],
        }),
      }),
    )

    const marker = '__NUTRITION_DATA__:'
    const full = chunks.join('')
    expect(res.fullReplyText).toContain(marker)
    expect(full).toContain(marker)

    const json = JSON.parse(res.fullReplyText.slice(marker.length))
    expect(json.food_name).toBe('Chè thái')
    expect(json.evaluation.overall_status).toBe('MODERATE')
    expect(json.llm_note).toContain('chè thái')
    expect(json.llm_note).not.toMatch(/MODERATE|SAFE|AVOID/)
    expect(json.llm_note).not.toMatch(/^Chào bạn/)
  })

  it('falls back to plain text streaming when structured_data is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply_text: 'Bạn muốn hỏi về món ăn nào?' }),
    })
    const chunks = []
    const res = await streamNutritionReply({
      messages: [{ role: 'user', content: 'chào bạn' }],
      conditions: [],
      onChunk: (c) => chunks.push(c),
    })

    expect(res.fullReplyText).toBe('Bạn muốn hỏi về món ăn nào?')
    expect(chunks.join('')).toBe('Bạn muốn hỏi về món ăn nào?')
    expect(res.performanceMeta.mode).toBe('text')
  })

  it('throws when the nutrition service responds with an error status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(
      streamNutritionReply({
        messages: [{ role: 'user', content: 'phở bò' }],
        conditions: [],
      }),
    ).rejects.toThrow('Nutrition service responded 500')
  })

  it('sanitizes malformed conditions before forwarding', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply_text: 'ok', structured_data: { food_name: 'X' } }),
    })
    await streamNutritionReply({
      messages: [{ role: 'user', content: 'món x' }],
      conditions: ['DIABETES', 123, null, '', 'x'.repeat(100)],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.conditions).toEqual(['DIABETES'])
  })

  it('stripNutritionMarker removes the marker payload', () => {
    expect(stripNutritionMarker('__NUTRITION_DATA__:{"a":1}')).toBe('')
    expect(stripNutritionMarker('text __NUTRITION_DATA__:{"a":1}')).toBe('text')
    expect(stripNutritionMarker('plain text')).toBe('plain text')
    expect(stripNutritionMarker('')).toBe('')
  })
})
