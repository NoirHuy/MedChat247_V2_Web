import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateReply, GUEST_CTA } from './generateReply.js'

// Mock dependencies
vi.mock('../../config/env.js', () => ({
  env: {
    isProd: false,
    llmApiKey: 'test-api-key',
    openrouterModelChat: 'test-chat-model',
  },
}))

vi.mock('../llm/llmClient.js', () => ({
  callLLM: vi.fn(async ({ onChunk }) => {
    const reply = 'Mock AI medical response.'
    if (onChunk) onChunk(reply)
    return reply
  }),
  callFinetunedLLM: vi.fn(async ({ onChunk }) => {
    const reply = 'Mock Fine-tuned Model medical response.'
    if (onChunk) onChunk(reply)
    return reply
  }),
}))

vi.mock('../llm/streaming.js', () => ({
  streamText: vi.fn(async (text, onChunk) => {
    if (onChunk) onChunk(text)
    return text
  }),
}))

vi.mock('./intentClassifier.js', () => ({
  detectIntent: vi.fn(async (text) => {
    if (text === 'chào bạn') return { type: 'quick', subtype: 'greeting' }
    if (text === 'thơ lục bát') return { type: 'refusal' }
    return { type: 'symptom_query' }
  }),
  streamQuickReply: vi.fn(async (lang, subtype, onChunk) => {
    const text = 'Chào bạn! Tôi có thể giúp gì?'
    if (onChunk) onChunk(text)
    return text
  }),
  streamRefusalReply: vi.fn(async (lang, onChunk) => {
    const text = 'Tôi chỉ hỗ trợ y tế.'
    if (onChunk) onChunk(text)
    return text
  }),
}))

vi.mock('../graphrag/adaptiveContext.js', () => ({
  computeAdaptiveContext: vi.fn(async () => ({
    allSymptoms: new Set(['s1', 's2']),
    confirmedSymptoms: ['s1'],
    excludedSymptoms: [],
    rankedDiseases: [],
    bestNextSymptoms: [],
  })),
}))

vi.mock('../graphrag/symptomExtraction.js', () => ({
  extractSymptomsFromHistory: vi.fn(async () => ({
    symptoms: [{ id: 's1', name: 'Đau đầu', status: 'positive' }],
    demographics: {},
    temporal: {},
  })),
}))

vi.mock('../graphrag/sceStateCache.js', () => ({
  getSCEState: vi.fn(async () => null),
  mergeSCEState: vi.fn((a, b) => b),
  setSCEState: vi.fn(async () => {}),
}))

vi.mock('../memory/memoryRetrieval.js', () => ({
  getActiveMemoryContext: vi.fn(async () => ({ promptBlock: '', memoriesUsed: [] })),
}))

vi.mock('./nutritionGateway.js', () => ({
  isNutritionSpecialty: vi.fn((id) => id === 'nutrition_consultation'),
  streamNutritionReply: vi.fn(async ({ onChunk }) => {
    const marker = '__NUTRITION_DATA__:{"food_name":"Phở bò"}'
    if (onChunk) onChunk(marker)
    return { fullReplyText: marker, memoriesUsed: [], performanceMeta: { nutritionGateway: true } }
  }),
}))

describe('generateReply - Guest vs Logged-in User Tiering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes quick intent immediately without GraphRAG or CTA', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'chào bạn' }],
      specialtyId: 'health_consultation',
      lang: 'vi',
      userId: null,
      onChunk: (c) => chunks.push(c),
    })

    expect(res.fullReplyText).toContain('Chào bạn!')
    expect(res.performanceMeta.intent).toBe('quick')
  })

  it('routes refusal intent immediately for out-of-scope queries', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'thơ lục bát' }],
      specialtyId: 'health_consultation',
      lang: 'vi',
      userId: null,
      onChunk: (c) => chunks.push(c),
    })

    expect(res.fullReplyText).toContain('Tôi chỉ hỗ trợ y tế.')
    expect(res.performanceMeta.intent).toBe('refusal')
  })

  it('for Guest (userId = null): runs Basic LLM and appends Vietnamese CTA footer', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tôi bị đau đầu 2 ngày nay' }],
      specialtyId: 'health_consultation',
      lang: 'vi',
      userId: null,
      onChunk: (c) => chunks.push(c),
    })

    expect(res.performanceMeta.isGuest).toBe(true)
    expect(res.performanceMeta.modelMode).toBe('basic_llm')
    expect(res.fullReplyText).toContain('Mock AI medical response.')
    expect(res.fullReplyText).toContain(GUEST_CTA.vi)
  })

  it('for Guest (userId = null): appends English CTA footer when lang is en', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'I have headache for 2 days' }],
      specialtyId: 'health_consultation',
      lang: 'en',
      userId: null,
      onChunk: (c) => chunks.push(c),
    })

    expect(res.performanceMeta.isGuest).toBe(true)
    expect(res.fullReplyText).toContain(GUEST_CTA.en)
  })

  it('for Guest: ignores static suggestion demo and routes to basic LLM with CTA', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tôi bị đau thắt ngực' }],
      specialtyId: 'health_consultation',
      isSuggestionDemo: true,
      suggestionId: 'disease_1',
      lang: 'vi',
      userId: null,
      onChunk: (c) => chunks.push(c),
    })

    expect(res.performanceMeta.staticSuggestionReply).toBeUndefined()
    expect(res.performanceMeta.isGuest).toBe(true)
    expect(res.fullReplyText).toContain(GUEST_CTA.vi)
  })

  it('for Logged-in User (userId provided): handles static suggestion demo without CTA', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tôi bị đau thắt ngực' }],
      specialtyId: 'health_consultation',
      isSuggestionDemo: true,
      suggestionId: 'disease_1',
      lang: 'vi',
      userId: 'user-123',
      onChunk: (c) => chunks.push(c),
    })

    expect(res.performanceMeta.staticSuggestionReply).toBe(true)
    expect(res.fullReplyText).not.toContain(GUEST_CTA.vi)
  })

  it('for Logged-in User (userId provided): runs full Enhanced GraphRAG without CTA', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tôi bị sốt cao kèm đau họng' }],
      specialtyId: 'health_consultation',
      lang: 'vi',
      userId: 'user-123',
      onChunk: (c) => chunks.push(c),
    })

    expect(res.performanceMeta.isGuest).toBeUndefined()
    expect(res.fullReplyText).not.toContain(GUEST_CTA.vi)
  })

  it('routes nutrition_consultation to the gateway before intent/GraphRAG pipelines', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tôi bị tiểu đường ăn chè thái được không?' }],
      specialtyId: 'nutrition_consultation',
      lang: 'vi',
      userId: 'user-123',
      conditions: ['DIABETES'],
      onChunk: (c) => chunks.push(c),
    })

    expect(res.fullReplyText).toContain('__NUTRITION_DATA__')
    expect(chunks.join('')).toContain('__NUTRITION_DATA__')
    expect(res.performanceMeta.nutritionGateway).toBe(true)
  })

  it('routes general_consultation to the fine-tuned model (Modal vLLM)', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Explain mechanism of ACE inhibitors' }],
      specialtyId: 'general_consultation',
      lang: 'en',
      userId: 'user-123',
      onChunk: (c) => chunks.push(c),
    })

    expect(res.fullReplyText).toContain('Mock Fine-tuned Model medical response.')
    expect(res.performanceMeta.specialty).toBe('general_consultation')
    expect(res.performanceMeta.fineTuned).toBe(true)
    expect(res.performanceMeta.model).toBe('qwen25-med')
    expect(res.fullReplyText).not.toContain(GUEST_CTA.en)
  })

  it('for general_consultation in guest mode: appends guest CTA', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tư vấn phác đồ điều trị tiểu đường type 2' }],
      specialtyId: 'general_consultation',
      lang: 'vi',
      userId: null,
      onChunk: (c) => chunks.push(c),
    })

    expect(res.fullReplyText).toContain('Mock Fine-tuned Model medical response.')
    expect(res.performanceMeta.isGuest).toBe(true)
    expect(res.fullReplyText).toContain(GUEST_CTA.vi)
  })

  it('injects personal memory context for general_consultation logged-in user', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tôi bị đau dạ dày thì dùng thuốc gì?' }],
      specialtyId: 'general_consultation',
      lang: 'vi',
      userId: 'user-123',
      sessionMemoryPaused: false,
      onChunk: (c) => chunks.push(c),
    })

    expect(res.fullReplyText).toContain('Mock Fine-tuned Model medical response.')
    expect(res.performanceMeta.specialty).toBe('general_consultation')
  })

  it('routes specialtyId="general" alias identically to general_consultation', async () => {
    const chunks = []
    const res = await generateReply({
      messages: [{ role: 'user', content: 'Tôi cần tư vấn tổng quát' }],
      specialtyId: 'general',
      lang: 'vi',
      userId: 'user-123',
      onChunk: (c) => chunks.push(c),
    })

    expect(res.performanceMeta.specialty).toBe('general_consultation')
    expect(res.performanceMeta.fineTuned).toBe(true)
  })
})
