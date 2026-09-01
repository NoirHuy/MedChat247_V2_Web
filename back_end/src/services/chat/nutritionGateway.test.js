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
  buildNutritionHistory,
  resetNutritionConditionsCache,
} from './nutritionGateway.js'

describe('nutritionGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    resetNutritionConditionsCache()
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
          history: [],
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

  it('buildNutritionHistory strips markers, excludes the last user turn and caps length', () => {
    const messages = [
      { role: 'user', content: 'Cơm tấm sườn bao nhiêu calo?' },
      { role: 'assistant', content: 'Cơm tấm sườn có 480 kcal __NUTRITION_DATA__:{"food_name":"Cơm tấm sườn"}' },
      { role: 'user', content: 'Vậy còn phở bò thì sao?' },
    ]
    const history = buildNutritionHistory(messages)
    expect(history).toEqual([
      { role: 'user', content: 'Cơm tấm sườn bao nhiêu calo?' },
      { role: 'assistant', content: 'Cơm tấm sườn có 480 kcal' },
    ])
    expect(history.some((m) => m.content.includes('__NUTRITION_DATA__'))).toBe(false)
    expect(buildNutritionHistory([])).toEqual([])
    expect(buildNutritionHistory(undefined)).toEqual([])
    // Marker-only assistant message falls back to a placeholder
    expect(
      buildNutritionHistory([
        { role: 'assistant', content: '__NUTRITION_DATA__:{"a":1}' },
        { role: 'user', content: 'tiếp' },
      ]),
    ).toEqual([{ role: 'assistant', content: '[Thẻ dữ liệu dinh dưỡng]' }])
  })

  it('forwards multi-turn history to the nutrition service', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply_text: 'ok', structured_data: { food_name: 'X' } }),
    })
    await streamNutritionReply({
      messages: [
        { role: 'user', content: 'Cơm tấm sườn bao nhiêu calo?' },
        { role: 'assistant', content: 'Cơm tấm sườn có 480 kcal __NUTRITION_DATA__:{"food_name":"Cơm tấm sườn"}' },
        { role: 'user', content: 'Vậy còn phở bò thì sao?' },
      ],
      conditions: [],
      conversationId: 'conv-1',
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.message).toBe('Vậy còn phở bò thì sao?')
    expect(body.history).toEqual([
      { role: 'user', content: 'Cơm tấm sườn bao nhiêu calo?' },
      { role: 'assistant', content: 'Cơm tấm sườn có 480 kcal' },
    ])
  })

  it('caches detected conditions per conversation and merges them into later turns', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply_text: 'ok',
          structured_data: { food_name: 'X' },
          active_conditions: ['GOUT', 'DIABETES'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply_text: 'ok', structured_data: { food_name: 'Y' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply_text: 'ok', structured_data: { food_name: 'Z' } }),
      })

    await streamNutritionReply({
      messages: [{ role: 'user', content: 'tôi bị gout và tiểu đường' }],
      conditions: [],
      conversationId: 'conv-1',
    })

    const secondBody = await streamNutritionReply({
      messages: [{ role: 'user', content: 'còn món này thì sao?' }],
      conditions: [],
      conversationId: 'conv-1',
    }).then(() => JSON.parse(fetchMock.mock.calls[1][1].body))
    expect(secondBody.conditions).toEqual(['GOUT', 'DIABETES'])

    // A different conversation must not inherit the cached conditions
    await streamNutritionReply({
      messages: [{ role: 'user', content: 'món gì tốt?' }],
      conditions: [],
      conversationId: 'conv-2',
    })
    const thirdBody = JSON.parse(fetchMock.mock.calls[2][1].body)
    expect(thirdBody.conditions).toEqual([])
  })

  it('llm_note skips rhetorical questions, headings and filler lines', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply_text: [
          '**1. Tại sao cần kiểm soát khẩu phần?**',
          'Món thịt bò xào nấm cung cấp đạm cao (22.5g). Người Gout nên kiểm soát khẩu phần để ổn định acid uric.',
          '',
          '**DƯỚI ĐÂY LÀ PHÂN TÍCH CHI TIẾT**',
          'Dưới đây là những lưu ý quan trọng:',
          'LỜI KHUYÊN QUAN TRỌNG NHẤT LÀ KIỂM SOÁT KHẨU PHẦN HẰNG NGÀY',
        ].join('\n'),
        structured_data: { food_name: 'Thịt bò xào nấm' },
      }),
    })
    const res = await streamNutritionReply({
      messages: [{ role: 'user', content: 'gout ăn thịt bò xào nấm được không?' }],
      conditions: ['GOUT'],
    })

    const json = JSON.parse(res.fullReplyText.slice('__NUTRITION_DATA__:'.length))
    expect(json.llm_note).toBe(
      'Món thịt bò xào nấm cung cấp đạm cao (22.5g). Người Gout nên kiểm soát khẩu phần để ổn định acid uric.',
    )
    expect(json.llm_note).not.toContain('?')
    expect(json.llm_note).not.toMatch(/ĐỀ XUẤT|DƯỚI ĐÂY|LỜI KHUYÊN/)
  })

  it('llm_note cuts at a word boundary with ellipsis when too long', async () => {
    const s1 =
      'Món ăn này rất giàu dinh dưỡng nhưng cũng chứa hàm lượng đạm và natri cao đáng kể trong mỗi khẩu phần tiêu thụ hàng ngày. '
    const s2 =
      'Người mắc bệnh mạn tính cần cân nhắc kỹ số lượng tiêu thụ để tránh làm tăng gánh nặng chuyển hóa cho cơ thể một cách không cần thiết. '
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply_text: s1 + s2 + 'Câu thứ ba ngắn gọn.',
        structured_data: { food_name: 'X' },
      }),
    })
    const res = await streamNutritionReply({
      messages: [{ role: 'user', content: 'món x' }],
      conditions: [],
    })

    const json = JSON.parse(res.fullReplyText.slice('__NUTRITION_DATA__:'.length))
    expect(json.llm_note.length).toBeLessThanOrEqual(221)
    expect(json.llm_note.endsWith('…')).toBe(true)
  })

  it('merges cached conditions with request conditions without duplicates', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply_text: 'ok',
          structured_data: { food_name: 'X' },
          active_conditions: ['DIABETES', 'GOUT'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply_text: 'ok', structured_data: { food_name: 'X' } }),
      })
    // Prime the cache for conv-3
    await streamNutritionReply({
      messages: [{ role: 'user', content: 'tôi bị gout' }],
      conditions: ['DIABETES'],
      conversationId: 'conv-3',
    })
    await streamNutritionReply({
      messages: [{ role: 'user', content: 'món gì?' }],
      conditions: ['DIABETES'],
      conversationId: 'conv-3',
    })
    const body = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body.conditions).toEqual(['DIABETES', 'GOUT'])
  })
})
