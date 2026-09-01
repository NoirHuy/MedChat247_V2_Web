import { describe, it, expect } from 'vitest'
import {
  SPECIALTIES,
  DEFAULT_SPECIALTY_ID,
  GENERAL_SPECIALTY_ID,
  NUTRITION_SPECIALTY_ID,
} from './specialties'
import {
  SUGGESTIONS,
  NUTRITION_SUGGESTIONS,
  GENERAL_SUGGESTIONS,
  getSuggestions,
} from './suggestions'

describe('specialties data', () => {
  it('defines the 3 core specialties with bilingual names', () => {
    expect(SPECIALTIES).toHaveLength(3)
    const ids = SPECIALTIES.map((s) => s.id)
    expect(ids).toEqual([
      'health_consultation',
      'general_consultation',
      'nutrition_consultation',
    ])

    SPECIALTIES.forEach((s) => {
      expect(s.name.vi).toBeTruthy()
      expect(s.name.en).toBeTruthy()
    })
  })

  it('exports correct specialty ID constants', () => {
    expect(DEFAULT_SPECIALTY_ID).toBe('health_consultation')
    expect(GENERAL_SPECIALTY_ID).toBe('general_consultation')
    expect(NUTRITION_SPECIALTY_ID).toBe('nutrition_consultation')
  })
})

describe('suggestions data and bilingual support', () => {
  function validateSuggestionSet(items, expectedCount) {
    expect(items).toHaveLength(expectedCount)
    items.forEach((item) => {
      expect(item.id).toBeTruthy()
      // Title
      expect(item.title).toBeDefined()
      expect(typeof item.title.vi).toBe('string')
      expect(item.title.vi.trim().length).toBeGreaterThan(0)
      expect(typeof item.title.en).toBe('string')
      expect(item.title.en.trim().length).toBeGreaterThan(0)

      // Detail
      expect(item.detail).toBeDefined()
      expect(typeof item.detail.vi).toBe('string')
      expect(item.detail.vi.trim().length).toBeGreaterThan(0)
      expect(typeof item.detail.en).toBe('string')
      expect(item.detail.en.trim().length).toBeGreaterThan(0)

      // Prompt
      expect(item.prompt).toBeDefined()
      expect(typeof item.prompt.vi).toBe('string')
      expect(item.prompt.vi.trim().length).toBeGreaterThan(0)
      expect(typeof item.prompt.en).toBe('string')
      expect(item.prompt.en.trim().length).toBeGreaterThan(0)
    })
  }

  it('validates 4 suggestions in default health consultation', () => {
    validateSuggestionSet(SUGGESTIONS, 4)
  })

  it('validates 4 suggestions in nutrition consultation', () => {
    validateSuggestionSet(NUTRITION_SUGGESTIONS, 4)
  })

  it('validates 4 suggestions in general consultation for both VI and EN', () => {
    validateSuggestionSet(GENERAL_SUGGESTIONS, 4)

    const ids = GENERAL_SUGGESTIONS.map((g) => g.id)
    expect(ids).toEqual(['gen_1', 'gen_2', 'gen_3', 'gen_4'])

    // gen_1
    expect(GENERAL_SUGGESTIONS[0].title.vi).toBe('Tư Vấn Lâm Sàng & Lối Sống')
    expect(GENERAL_SUGGESTIONS[0].title.en).toBe('Clinical Care & Lifestyle')
    expect(GENERAL_SUGGESTIONS[0].prompt.vi).toContain('Đái tháo đường type 2')
    expect(GENERAL_SUGGESTIONS[0].prompt.en).toContain('Type 2 Diabetes')

    // gen_2
    expect(GENERAL_SUGGESTIONS[1].title.vi).toBe('Bệnh Học & Dược Lý')
    expect(GENERAL_SUGGESTIONS[1].title.en).toBe('Pathophysiology & Pharmacology')
    expect(GENERAL_SUGGESTIONS[1].prompt.vi).toContain('ACE inhibitors')
    expect(GENERAL_SUGGESTIONS[1].prompt.en).toContain('ACE inhibitors')

    // gen_3
    expect(GENERAL_SUGGESTIONS[2].title.vi).toBe('Chẩn Đoán Phân Biệt')
    expect(GENERAL_SUGGESTIONS[2].title.en).toBe('Differential Diagnosis')
    expect(GENERAL_SUGGESTIONS[2].prompt.vi).toContain('thượng vị')
    expect(GENERAL_SUGGESTIONS[2].prompt.en).toContain('epigastric pain')

    // gen_4
    expect(GENERAL_SUGGESTIONS[3].title.vi).toBe('Đau Đầu Căng Thẳng & Mất Ngủ')
    expect(GENERAL_SUGGESTIONS[3].title.en).toBe('Tension Headache & Insomnia')
    expect(GENERAL_SUGGESTIONS[3].prompt.vi).toContain('bó chặt')
    expect(GENERAL_SUGGESTIONS[3].prompt.en).toContain('tight squeezing pain')
  })

  it('getSuggestions returns correct suggestions array per specialtyId', () => {
    expect(getSuggestions('nutrition_consultation')).toBe(NUTRITION_SUGGESTIONS)
    expect(getSuggestions('general_consultation')).toBe(GENERAL_SUGGESTIONS)
    expect(getSuggestions('health_consultation')).toBe(SUGGESTIONS)
    expect(getSuggestions('unknown_specialty')).toBe(SUGGESTIONS)
    expect(getSuggestions(undefined)).toBe(SUGGESTIONS)
  })
})
