import { describe, it, expect } from 'vitest'
import { isValidPlanId, getPlan, PLANS } from './plans.js'

describe('plans config', () => {
  it('has exactly two plans', () => {
    expect(PLANS).toHaveLength(2)
  })

  it('free plan has correct token limit', () => {
    const free = PLANS.find(p => p.id === 'free')
    expect(free).toBeDefined()
    expect(free.tokenLimit).toBe(500000000)
  })

  it('pro plan has correct token limit', () => {
    const pro = PLANS.find(p => p.id === 'pro')
    expect(pro).toBeDefined()
    expect(pro.tokenLimit).toBe(2000000000)
  })

  it('isValidPlanId returns true for free', () => {
    expect(isValidPlanId('free')).toBe(true)
  })

  it('isValidPlanId returns true for pro', () => {
    expect(isValidPlanId('pro')).toBe(true)
  })

  it('isValidPlanId returns false for unknown plan', () => {
    expect(isValidPlanId('enterprise')).toBe(false)
    expect(isValidPlanId('')).toBe(false)
    expect(isValidPlanId(null)).toBe(false)
    expect(isValidPlanId(undefined)).toBe(false)
  })

  it('getPlan returns free for unknown planId (default)', () => {
    expect(getPlan('unknown').id).toBe('free')
    expect(getPlan(null).id).toBe('free')
    expect(getPlan(undefined).id).toBe('free')
  })

  it('getPlan returns correct plan for valid ids', () => {
    expect(getPlan('free').id).toBe('free')
    expect(getPlan('pro').id).toBe('pro')
  })
})
