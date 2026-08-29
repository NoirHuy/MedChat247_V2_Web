import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  upsertSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  paymentFindOne: vi.fn(),
  paymentFindOneAndUpdate: vi.fn(),
  userFindOne: vi.fn(),
  capturePayPalOrder: vi.fn(),
}))

vi.mock('../config/env.js', () => ({
  env: {
    paypalClientId: 'test',
    paypalClientSecret: 'test',
    paypalWebhookId: 'wh-123',
    paypalMode: 'sandbox',
    paypalApiBase: 'https://api-m.sandbox.paypal.com',
  },
}))
vi.mock('../utils/auditLog.js', () => ({ auditLog: vi.fn() }))
vi.mock('../services/paypalClient.js', () => ({
  getPayPalAccessToken: vi.fn(),
  createPayPalOrder: vi.fn(),
  capturePayPalOrder: mocks.capturePayPalOrder,
}))
vi.mock('../utils/paypal-webhook.util.js', () => ({
  verifyPayPalWebhookSignature: mocks.verifyWebhook,
  parsePayPalCustom: (value) => {
    if (!value) return {}
    try { return JSON.parse(value) } catch { return {} }
  },
}))
vi.mock('../services/subscription.service.js', () => ({
  upsertSubscriptionAndSync: mocks.upsertSubscription,
  cancelSubscriptionAndSync: mocks.cancelSubscription,
}))
vi.mock('../db/payment.model.js', () => ({
  PaymentModel: {
    findOne: mocks.paymentFindOne,
    findOneAndUpdate: mocks.paymentFindOneAndUpdate,
  },
}))
vi.mock('../db/user.model.js', () => ({ UserModel: { findOne: mocks.userFindOne } }))
vi.mock('../db/usersRepo.js', () => ({ toPublicUser: (user) => user }))

const { default: paymentRouter } = await import('./payment.routes.js')
const express = (await import('express')).default
const supertest = (await import('supertest')).default

function buildApp() {
  const app = express()
  app.use('/api/payments', paymentRouter)
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message })
  })
  return app
}

async function invokeWebhook(payload, existingPayment = null) {
  mocks.verifyWebhook.mockResolvedValue({ valid: true, reason: 'SUCCESS' })
  mocks.paymentFindOne.mockReturnValue({ lean: async () => existingPayment })
  mocks.paymentFindOneAndUpdate.mockResolvedValue({})
  return supertest(buildApp())
    .post('/api/payments/paypal/webhook')
    .set('content-type', 'application/json')
    .send(payload)
}

describe('PayPal webhook order identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyWebhook.mockResolvedValue({ valid: true, reason: 'SUCCESS' })
  })

  it('keys completed capture by checkout order id, not capture id', async () => {
    const res = await invokeWebhook({
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE-XYZ',
        supplementary_data: { related_ids: { order_id: 'PAY-ORDER-1' } },
        amount: { value: '3.99', currency_code: 'USD' },
        custom: JSON.stringify({ userId: 'u_owner', planId: 'pro' }),
      },
    }, {
      userId: 'u_owner',
      billingToken: 'PAY-ORDER-1',
      status: 'pending',
      paymentGateway: 'paypal',
    })

    expect(res.status).toBe(200)
    expect(mocks.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u_owner',
      externalId: 'PAY-ORDER-1',
    }))
    expect(mocks.paymentFindOneAndUpdate).toHaveBeenCalledWith(
      { paymentGateway: 'paypal', billingToken: 'PAY-ORDER-1' },
      expect.objectContaining({ $set: expect.objectContaining({ paypalCaptureId: 'CAPTURE-XYZ' }) }),
      { upsert: true },
    )
  })

  it('acks (200) and skips a completed webhook when stored payment ownership differs', async () => {
    // Permanent business-rule rejection: ack with 200 so PayPal stops
    // redelivering an event we can never act on. The subscription must NOT be
    // upgraded for the attacker's userId.
    const res = await invokeWebhook({
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE-XYZ',
        supplementary_data: { related_ids: { order_id: 'PAY-ORDER-1' } },
        custom: JSON.stringify({ userId: 'u_attacker', planId: 'pro' }),
      },
    }, {
      userId: 'u_owner',
      billingToken: 'PAY-ORDER-1',
      paypalCaptureId: 'CAPTURE-XYZ',
    })

    expect(res.status).toBe(200)
    expect(mocks.upsertSubscription).not.toHaveBeenCalled()
  })

  it('refund resolves ownership and canonical order from stored capture id', async () => {
    const res = await invokeWebhook({
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'CAPTURE-XYZ' },
    }, {
      userId: 'u_owner',
      billingToken: 'PAY-ORDER-1',
      paypalCaptureId: 'CAPTURE-XYZ',
    })

    expect(res.status).toBe(200)
    expect(mocks.cancelSubscription).toHaveBeenCalledWith({
      userId: 'u_owner',
      platform: 'paypal',
      externalId: 'PAY-ORDER-1',
    })
  })

  it('rejects unsigned events with 400', async () => {
    mocks.verifyWebhook.mockResolvedValueOnce({ valid: false, reason: 'Signature invalid' })
    const res = await supertest(buildApp())
      .post('/api/payments/paypal/webhook')
      .set('content-type', 'application/json')
      .send({ event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: {} })

    expect(res.status).toBe(400)
  })
})
