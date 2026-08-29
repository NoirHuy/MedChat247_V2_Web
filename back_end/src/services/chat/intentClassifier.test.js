import { describe, expect, it } from 'vitest'
import { detectIntent, streamQuickReply, streamRefusalReply, classifyQuickSubtype } from './intentClassifier.js'

describe('classifyQuickSubtype', () => {
  const cases = /** @type {const} */ ([
    // Greeting
    ['hi', 'greeting'],
    ['hello', 'greeting'],
    ['hello!', 'greeting'],
    ['hey', 'greeting'],
    ['chào', 'greeting'],
    ['Xin chào', 'greeting'],
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
    // Bot identity
    ['bạn là ai', 'bot_identity'],
    ['who are you?', 'bot_identity'],
    ['what can you do?', 'bot_identity'],
    ['giới thiệu MedChat', 'bot_identity'],
    // Not quick
    ['tôi bị đau bụng', null],
    ['sốt là gì', null],
    ['thuốc paracetamol uống như thế nào', null],
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
    const result = await detectIntent('bạn là ai?', 'vi')
    expect(result.type).toBe('quick')
    expect(result.subtype).toBe('bot_identity')
  })
})

describe('detectIntent — symptom keyword path (rule-based, no LLM)', () => {
  it('classifies empty text as symptom_query', async () => {
    await expect(detectIntent('', 'vi')).resolves.toMatchObject({ type: 'symptom_query' })
    await expect(detectIntent('   ', 'vi')).resolves.toMatchObject({ type: 'symptom_query' })
  })

  it('classifies symptom descriptions as symptom_query via keyword (VI)', async () => {
    const inputs = [
      'tôi bị đau bụng',
      'đau đầu dữ dội',
      'sốt 3 ngày rồi',
      'không ho, không sốt',
      'nghẹt mũi và đau họng',
      'mệt mỏi suốt tuần',
      'ngứa lắm',
      'đau họng không nuốt được',
    ]
    for (const input of inputs) {
      const result = await detectIntent(input, 'vi')
      expect(result.type, `Failed for: "${input}"`).toBe('symptom_query')
      expect(result.confidence).toBe(0.85)
    }
  })

  it('classifies symptom descriptions as symptom_query via keyword (EN)', async () => {
    // These phrases contain English symptom keywords present in SYMPTOM_KEYWORDS_EN
    const inputs = [
      'I have a headache',       // contains 'headache'
      'I have a fever',          // contains 'fever'
      'I am not coughing',      // contains 'cough'
      'fever for 3 days',        // contains 'fever'
      'sore throat and cough',   // contains 'sore throat', 'cough'
    ]
    for (const input of inputs) {
      const result = await detectIntent(input, 'en')
      expect(result.type, `Failed for: "${input}"`).toBe('symptom_query')
      expect(result.confidence).toBe(0.85)
    }
  })

  it('escalates any clinical keyword mention to symptom_query', async () => {
    // 'sốt' is in SYMPTOM_KEYWORDS_VI → keyword path, confidence = 0.85
    const result = await detectIntent('sốt là gì?', 'vi')
    expect(result.type).toBe('symptom_query')
    expect(result.confidence).toBe(0.85)
  })

  it('classifies denial of symptoms as symptom_query', async () => {
    const result = await detectIntent('tôi không bị ho và không bị sốt', 'vi')
    expect(result.type).toBe('symptom_query')
    expect(result.confidence).toBe(0.85)
  })
})

describe('streamQuickReply', () => {
  it('streams greeting reply in Vietnamese', async () => {
    const chunks = []
    await streamQuickReply('vi', 'greeting', (c) => chunks.push(c), null)
    const full = chunks.join('')
    expect(full).toContain('Chào bạn')
    expect(full).toContain('MedChat247')
  })

  it('streams greeting reply in English', async () => {
    const chunks = []
    await streamQuickReply('en', 'greeting', (c) => chunks.push(c), null)
    const full = chunks.join('')
    expect(full).toContain('Hello')
    expect(full).toContain('MedChat247')
  })

  it('streams thanks reply in Vietnamese', async () => {
    const chunks = []
    await streamQuickReply('vi', 'thanks', (c) => chunks.push(c), null)
    expect(chunks.join('')).toContain('Cảm ơn')
  })

  it('streams farewell reply in Vietnamese', async () => {
    const chunks = []
    await streamQuickReply('vi', 'farewell', (c) => chunks.push(c), null)
    expect(chunks.join('')).toContain('Tạm biệt')
  })

  it('streams bot identity reply in Vietnamese', async () => {
    const chunks = []
    await streamQuickReply('vi', 'bot_identity', (c) => chunks.push(c), null)
    const full = chunks.join('')
    expect(full).toContain('MedChat247')
    expect(full).toContain('trợ lý')
  })

  it('falls back to VI greeting for unknown subtype', async () => {
    const chunks = []
    // @ts-ignore – intentionally passing invalid subtype
    await streamQuickReply('vi', 'unknown_subtype', (c) => chunks.push(c), null)
    expect(chunks.join('')).toContain('Chào bạn')
  })
})

describe('streamRefusalReply', () => {
  it('streams refusal in Vietnamese', async () => {
    const chunks = []
    await streamRefusalReply('vi', (c) => chunks.push(c), null)
    const full = chunks.join('')
    expect(full).toContain('Xin lỗi')
    expect(full).toContain('triệu chứng')
  })

  it('streams refusal in English', async () => {
    const chunks = []
    await streamRefusalReply('en', (c) => chunks.push(c), null)
    const full = chunks.join('')
    expect(full).toContain("I'm sorry")
    expect(full).toContain('symptom')
  })
})
