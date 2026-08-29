import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../db/usersRepo.js', () => ({
  findUserById: vi.fn(),
  reserveUsage: vi.fn(),
  incrementUsage: vi.fn(),
  updateUser: vi.fn(),
  toPublicUser: (u) => u,
}))

vi.mock('../config/plans.js', () => ({
  getPlan: (id) => id === 'pro'
    ? { id: 'pro', tokenLimit: 2000000 }
    : { id: 'free', tokenLimit: 50000 },
}))

const { reserveChatQuota, validateMessages } = await import('./chat.routes.js')
const { findUserById, reserveUsage } = await import('../db/usersRepo.js')

describe('reserveChatQuota', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is a no-op for guest users', async () => {
    const res = await reserveChatQuota(null, [{ role: 'user', content: 'hi' }])
    expect(res).toBeNull()
    expect(reserveUsage).not.toHaveBeenCalled()
  })

  it('blocks requests once the quota ceiling is reached', async () => {
    findUserById.mockResolvedValue({ id: 'u1', planId: 'free' })
    reserveUsage.mockResolvedValue(null)

    await expect(
      reserveChatQuota('u1', [{ role: 'user', content: 'Tôi bị sốt' }]),
    ).rejects.toMatchObject({ status: 429 })

    expect(reserveUsage).toHaveBeenCalledOnce()
  })

  it('reserves token usage within plan limits', async () => {
    findUserById.mockResolvedValue({ id: 'u1', planId: 'pro' })
    reserveUsage.mockResolvedValue({ id: 'u1', tokensUsed: 1234 })

    const res = await reserveChatQuota('u1', [
      { role: 'user', content: 'Xin chào' },
      { role: 'assistant', content: 'Chào bạn' },
    ])

    expect(res).not.toBeNull()
    expect(res.inputTokens).toBeGreaterThan(0)
    expect(reserveUsage).toHaveBeenCalledWith('u1', 2000000, expect.any(Number))
  })

  it('rejects when the user record cannot be located', async () => {
    findUserById.mockResolvedValue(null)

    await expect(
      reserveChatQuota('ghost', [{ role: 'user', content: 'hi' }]),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('validates that guest messages still pass message-shape validation', () => {
    expect(() => validateMessages([{ role: 'user', content: 'hi' }])).not.toThrow()
  })
})
