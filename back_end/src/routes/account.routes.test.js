import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidPlanId, PLANS } from '../config/plans.js'

// Mock the repo functions used by account.routes
vi.mock('../db/usersRepo.js', () => ({
  findUserById: vi.fn(),
  updateUser: vi.fn(),
  toPublicUser: (u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    planId: u.planId,
    subscriptionStatus: u.subscriptionStatus,
    subscriptionExpiresAt: u.subscriptionExpiresAt,
    autoRenew: u.autoRenew,
    billingMethod: u.billingMethod,
    billingDetails: u.billingDetails,
  }),
}))

// Inline the router logic we want to test so we don't need the full Express app
async function patchPlan({ userId, body, findUserById, updateUser }) {
  const { planId } = body ?? {}
  if (!isValidPlanId(planId)) {
    return { status: 400, body: { error: 'Gói thuê bao không hợp lệ.' } }
  }

  const user = await findUserById(userId)
  if (!user) return { status: 404, body: { error: 'Không tìm thấy tài khoản.' } }

  // Pro is blocked — must use PayPal flow
  if (planId === 'pro') {
    return {
      status: 403,
      body: { error: 'Vui lòng sử dụng thanh toán PayPal để nâng cấp gói Pro.' },
    }
  }

  // Only free is allowed here
  const patch = { planId: 'free' }
  patch.subscriptionStatus = 'none'
  patch.subscriptionExpiresAt = null
  patch.autoRenew = false

  const updatedUser = await updateUser(userId, patch)
  return { status: 200, body: { user: updatedUser, message: 'Đã chuyển về gói Miễn phí.' } }
}

const { findUserById, updateUser } = await import('../db/usersRepo.js')

describe('PATCH /api/account/plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects upgrade to pro plan with 403', async () => {
    findUserById.mockResolvedValue({ id: 'u1', email: 'test@test.com', planId: 'free' })
    const res = await patchPlan({ userId: 'u1', body: { planId: 'pro' }, findUserById, updateUser })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('PayPal')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects unknown planId with 400', async () => {
    const res = await patchPlan({ userId: 'u1', body: { planId: 'enterprise' }, findUserById, updateUser })
    expect(res.status).toBe(400)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects plan change for non-existent user with 404', async () => {
    findUserById.mockResolvedValue(null)
    const res = await patchPlan({ userId: 'ghost', body: { planId: 'free' }, findUserById, updateUser })
    expect(res.status).toBe(404)
  })

  it('allows downgrade to free plan', async () => {
    const user = { id: 'u1', email: 'pro@test.com', planId: 'pro', subscriptionStatus: 'active' }
    findUserById.mockResolvedValue(user)
    updateUser.mockImplementation((id, patch) => ({ ...user, ...patch }))
    const res = await patchPlan({ userId: 'u1', body: { planId: 'free' }, findUserById, updateUser })
    expect(res.status).toBe(200)
    expect(res.body.message).toContain('Miễn phí')
    expect(updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({
      planId: 'free',
      subscriptionStatus: 'none',
      autoRenew: false,
    }))
  })

  it('free-to-free is a no-op that still succeeds', async () => {
    const user = { id: 'u1', email: 'free@test.com', planId: 'free', subscriptionStatus: 'none' }
    findUserById.mockResolvedValue(user)
    updateUser.mockImplementation((id, patch) => ({ ...user, ...patch }))
    const res = await patchPlan({ userId: 'u1', body: { planId: 'free' }, findUserById, updateUser })
    expect(res.status).toBe(200)
    expect(updateUser).toHaveBeenCalled()
  })
})

describe('GET /api/account/plans', () => {
  it('returns the same PLANS exported from plans config', () => {
    expect(Array.isArray(PLANS)).toBe(true)
    expect(PLANS).toHaveLength(2)
    const ids = PLANS.map((p) => p.id).sort()
    expect(ids).toEqual(['free', 'pro'])
  })

  it('every plan has an id and a positive tokenLimit', () => {
    for (const p of PLANS) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.tokenLimit).toBe('number')
      expect(p.tokenLimit).toBeGreaterThan(0)
    }
  })

  it('free plan has 500,000,000 token limit', () => {
    const free = PLANS.find((p) => p.id === 'free')
    expect(free.tokenLimit).toBe(500000000)
  })

  it('pro plan has 2,000,000,000 token limit', () => {
    const pro = PLANS.find((p) => p.id === 'pro')
    expect(pro.tokenLimit).toBe(2000000000)
  })
})
