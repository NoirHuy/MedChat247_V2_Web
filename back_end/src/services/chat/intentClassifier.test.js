import { describe, expect, it } from 'vitest'
import { detectIntent, detectGeneralConsultationIntent, streamQuickReply, streamRefusalReply, classifyQuickSubtype } from './intentClassifier.js'

describe('classifyQuickSubtype', () => {
  const cases = /** @type {const} */ ([
    // Greeting
    ['hi', 'greeting'],
    ['hello', 'greeting'],
    ['hello!', 'greeting'],
    ['hey', 'greeting'],
    ['chào', 'greeting'],
    ['chào bạn', 'greeting'],
    ['chào bot', 'greeting'],
    ['Xin chào', 'greeting'],
    ['xin chào bác sĩ', 'greeting'],
    ['halo', 'greeting'],
    ['good morning', 'greeting'],
    ['Good Morning!', 'greeting'],
    ['Namaste', 'greeting'],
    // Thanks
    ['cảm ơn', 'thanks'],
    ['Cảm ơn bạn!', 'thanks'],
    ['thanks', 'thanks'],
    ['Thank you', 'thanks'],
    // Farewell
    ['tạm biệt', 'farewell'],
    ['goodbye', 'farewell'],
    ['bye', 'farewell'],
    ['hẹn gặp lại', 'farewell'],
    // Bot identity & Model questions
    ['bạn là ai', 'bot_identity'],
    ['who are you?', 'bot_identity'],
    ['what can you do?', 'bot_identity'],
    ['giới thiệu MedChat', 'bot_identity'],
    ['bạn là model gì?', 'bot_identity'],
    ['bạn là mô hình gì', 'bot_identity'],
    ['what model are you?', 'bot_identity'],
    ['bạn là chatgpt à', 'bot_identity'],
    // Not quick
    ['tôi bị đau bụng', null],
    ['sốt là gì', null],
    ['thuốc paracetamol uống như thế nào', null],
    ['hãy viết code python tính dãy fibonacci', null],
  ])

  cases.forEach(([input, expected]) => {
    it(`"${input}" → ${expected ?? 'null'}`, () => {
      expect(classifyQuickSubtype(/** @type {string} */ (input))).toBe(expected)
    })
  })
})

describe('detectIntent — quick patterns', () => {
  it('classifies greeting patterns as quick/greeting', async () => {
    const result = await detectIntent('hello', 'vi')
    expect(result.type).toBe('quick')
    expect(result.subtype).toBe('greeting')
    expect(result.confidence).toBe(1.0)
  })

  it('classifies thanks patterns as quick/thanks', async () => {
    const result = await detectIntent('cảm ơn bạn!', 'vi')
    expect(result.type).toBe('quick')
    expect(result.subtype).toBe('thanks')
  })

  it('classifies farewell patterns as quick/farewell', async () => {
    const result = await detectIntent('tạm biệt nhé', 'vi')
    expect(result.type).toBe('quick')
    expect(result.subtype).toBe('farewell')
  })

  it('classifies bot identity as quick/bot_identity', async () => {
    const result = await detectIntent('bạn là model gì?', 'vi')
    expect(result.type).toBe('quick')
    expect(result.subtype).toBe('bot_identity')
  })
})

describe('detectGeneralConsultationIntent', () => {
  it('classifies quick identity query as quick/bot_identity', async () => {
    const result = await detectGeneralConsultationIntent('bạn là model gì?', 'vi')
    expect(result.type).toBe('quick')
    expect(result.subtype).toBe('bot_identity')
  })

  it('classifies medical questions as medical_query via keywords', async () => {
    const result = await detectGeneralConsultationIntent('Phác đồ điều trị tiểu đường type 2 với Metformin?', 'vi')
    expect(result.type).toBe('medical_query')
  })

  it('classifies English clinical query as medical_query', async () => {
    const result = await detectGeneralConsultationIntent('A 52-year-old male newly diagnosed with Type 2 Diabetes (HbA1c 7.8%)', 'en')
    expect(result.type).toBe('medical_query')
  })
})

describe('streamQuickReply', () => {
  it('streams greeting reply in Vietnamese for general consultation', async () => {
    const chunks = []
    await streamQuickReply('vi', 'greeting', (c) => chunks.push(c), null, 'general_consultation')
    const full = chunks.join('')
    expect(full).toContain('MedChat247')
    expect(full).toContain('Chuyên sâu')
  })

  it('streams bot identity reply in Vietnamese for nutrition consultation', async () => {
    const chunks = []
    await streamQuickReply('vi', 'bot_identity', (c) => chunks.push(c), null, 'nutrition_consultation')
    const full = chunks.join('')
    expect(full).toContain('NutriChat AI')
  })

  it('streams greeting reply in English for health consultation', async () => {
    const chunks = []
    await streamQuickReply('en', 'greeting', (c) => chunks.push(c), null, 'health_consultation')
    const full = chunks.join('')
    expect(full).toContain('Hello')
    expect(full).toContain('MedChat247')
  })
})

describe('streamRefusalReply', () => {
  it('streams refusal in Vietnamese for general consultation', async () => {
    const chunks = []
    await streamRefusalReply('vi', (c) => chunks.push(c), null, 'general_consultation')
    const full = chunks.join('')
    expect(full).toContain('Xin lỗi')
    expect(full).toContain('Y khoa')
  })

  it('streams refusal in Vietnamese for nutrition consultation', async () => {
    const chunks = []
    await streamRefusalReply('vi', (c) => chunks.push(c), null, 'nutrition_consultation')
    const full = chunks.join('')
    expect(full).toContain('Dinh dưỡng')
  })

  it('streams refusal in English', async () => {
    const chunks = []
    await streamRefusalReply('en', (c) => chunks.push(c), null, 'health_consultation')
    const full = chunks.join('')
    expect(full).toContain("I'm sorry")
    expect(full).toContain('symptom')
  })
})
