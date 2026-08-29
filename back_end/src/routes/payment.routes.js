import { Router, raw } from 'express'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import { paymentLimiter } from '../middleware/rateLimiters.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { UserModel } from '../db/user.model.js'
import { PaymentModel } from '../db/payment.model.js'
import { toPublicUser } from '../db/usersRepo.js'
import { createPayPalOrder, capturePayPalOrder } from '../services/paypalClient.js'
import {
  verifyPayPalWebhookSignature,
  parsePayPalCustom,
} from '../utils/paypal-webhook.util.js'
import { auditLog } from '../utils/auditLog.js'
import { safeSetNx } from '../config/redis.js'
import { PRO_PLAN, PRO_DURATION_MS } from '../config/plans.js'
import {
  upsertSubscriptionAndSync,
  cancelSubscriptionAndSync,
} from '../services/subscription.service.js'

const router = Router()

// PayPal redelivers webhooks until it sees a 2xx; without de-duplication each
// replay of PAYMENT.CAPTURE.COMPLETED would extend the Pro subscription by
// another 30 days. Mark event IDs as seen for 90 days (longer than PayPal's
// retry horizon). Redis unavailable => skip dedup (the success-status guard in
// the handler still prevents double upgrades).
const WEBHOOK_EVENT_TTL_SECONDS = 90 * 24 * 60 * 60

async function isDuplicateWebhookEvent(eventId) {
  if (!eventId) return false
  return !(await safeSetNx(`paypal:event:${eventId}`, WEBHOOK_EVENT_TTL_SECONDS))
}

// ─── 0. PAYPAL PUBLIC CONFIG (Client ID & Mode for Frontend Buttons) ────────
router.get('/config', (req, res) => {
  res.json({
    clientId: env.paypalClientId,
    mode: env.paypalMode,
    isConfigured: !!(env.paypalClientId && env.paypalClientSecret)
  })
})

// ─── 0.5 PAYPAL WEBHOOK (Public — no JWT) ────────────────────────────────────
// PayPal gọi đến endpoint này khi có event (payment.completed, refunded, ...).
// Phải đặt TRƯỚC router.use(requireAuth) vì PayPal không gửi JWT.
router.post(
  '/paypal/webhook',
  raw({ type: 'application/json', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    let event
    try {
      // req.body là Buffer do dùng raw()
      event = JSON.parse(req.body.toString('utf8'))
    } catch (err) {
      auditLog('PAYPAL_WEBHOOK', 'Error', `Invalid JSON body: ${err.message}`, 'error')
      return res.status(400).json({ error: 'Invalid JSON' })
    }

    // 1. Verify signature
    const verifyResult = await verifyPayPalWebhookSignature(req.headers, event)
    if (!verifyResult.valid) {
      auditLog('PAYPAL_WEBHOOK', 'Warn', `Signature invalid: ${verifyResult.reason}`, 'warn')
      return res.status(400).json({ error: 'Invalid signature' })
    }

    // 1.5 De-duplicate redelivered events (PayPal retries until 2xx).
    if (await isDuplicateWebhookEvent(event.id)) {
      auditLog('PAYPAL_WEBHOOK', 'Info', `Duplicate event ${event.id} (${event.event_type}) ignored`, 'info')
      return res.status(200).json({ received: true, duplicate: true })
    }

    const eventType = event.event_type
    const resource = event.resource || {}
    const purchaseUnit = resource.purchase_units?.[0] || {}
    const custom = parsePayPalCustom(
      resource.custom || resource.custom_id || purchaseUnit.custom || purchaseUnit.custom_id,
    )
    // A completed capture has its own resource.id. Preserve the checkout order
    // ID as the canonical subscription/payment key so refunds can revoke it.
    const relatedOrderId = resource.supplementary_data?.related_ids?.order_id
      || resource.invoice_id
      || resource.billing_agreement_id
    const captureId = resource.id || null
    const paymentLookup = relatedOrderId || captureId
    const existingPayment = paymentLookup
      ? await PaymentModel.findOne({
          paymentGateway: 'paypal',
          $or: [{ billingToken: paymentLookup }, { paypalCaptureId: paymentLookup }],
        }).lean()
      : null
    const orderId = existingPayment?.billingToken || relatedOrderId || resource.id

    auditLog('PAYPAL_WEBHOOK', 'Info', `Received ${eventType} for order ${orderId}`, 'info')

    // 2. Handle events
    switch (eventType) {
      case 'CHECKOUT.ORDER.COMPLETED':
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // User thanh toán thành công
        if (!custom.userId) {
          auditLog('PAYPAL_WEBHOOK', 'Warn', `Missing userId in custom for ${orderId}`, 'warn')
          break
        }

        // Chỉ cho phép webhook hoàn tất payment đã gắn với đúng user.
        // Nếu callback capture tạo record trước, webhook phải giữ nguyên ownership.
        const paymentFilter = { paymentGateway: 'paypal', billingToken: orderId }
        const payment = await PaymentModel.findOne(paymentFilter).lean()
        if (!payment) {
          // Permanent condition: ack so PayPal stops redelivering an event we
          // can never act on.
          auditLog('PAYPAL_WEBHOOK', 'Warn', `No local payment record for order ${orderId}`, 'warn')
          break
        }
        if (payment.userId !== custom.userId) {
          auditLog('PAYPAL_WEBHOOK', 'Error', `User mismatch for order ${orderId}`, 'error')
          break
        }
        // Idempotency fallback (when Redis dedup is unavailable): never
        // re-extend a subscription for an order already marked successful.
        if (payment.status === 'success') {
          auditLog('PAYPAL_WEBHOOK', 'Info', `Order ${orderId} already completed; skipping replay`, 'info')
          break
        }

        const webhookAmount = resource.amount?.value || resource.amount?.total || purchaseUnit.amount?.value
        const webhookCurrency = resource.amount?.currency_code || resource.amount?.currency || purchaseUnit.amount?.currency_code
        if (webhookAmount !== PRO_PLAN.priceUsd || webhookCurrency !== PRO_PLAN.currency) {
          auditLog('PAYPAL_WEBHOOK', 'Error', `Amount mismatch for order ${orderId}`, 'error')
          return res.status(400).json({ error: 'Payment amount mismatch' })
        }

        // Tính expiresAt từ thời hạn gói trong config
        const expiresAt = new Date(Date.now() + PRO_DURATION_MS)

        await upsertSubscriptionAndSync({
          userId: custom.userId,
          platform: 'paypal',
          externalId: orderId,
          productId: custom.planId || 'pro',
          startedAt: new Date(),
          expiresAt,
          autoRenew: false,
          metadata: {
            amount: resource.amount?.total || resource.amount?.value,
            currency: resource.amount?.currency || resource.amount?.currency_code,
            payerEmail: resource.payer?.email_address || resource.payer?.payer_info?.email,
            transactionId: resource.id,
            eventType,
          },
        })

        await PaymentModel.findOneAndUpdate(
          paymentFilter,
          {
            $set: {
              status: 'success',
              completedAt: new Date(),
              paypalCaptureId: captureId || payment?.paypalCaptureId || null,
            },
            $setOnInsert: {
              id: `pay_webhook_${randomUUID()}`,
              userId: custom.userId,
              planId: custom.planId || 'pro',
              amount: Number(resource.amount?.value || resource.amount?.total || purchaseUnit.amount?.value || 0),
              type: 'initial',
              billingToken: orderId,
              paymentGateway: 'paypal',
            },
          },
          { upsert: true },
        )

        auditLog('PAYPAL_WEBHOOK', 'Info', `Upgraded user ${custom.userId} to Pro via PayPal`, 'info')
        break
      }

      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'CHECKOUT.ORDER.CANCELLED': {
        // Refund payloads do not consistently repeat custom metadata. Resolve
        // ownership from our canonical checkout-order payment record instead.
        const payment = existingPayment || await PaymentModel.findOne({
          paymentGateway: 'paypal',
          billingToken: orderId,
        }).lean()
        const userId = custom.userId || payment?.userId
        if (!userId) {
          auditLog('PAYPAL_WEBHOOK', 'Warn', `Cannot resolve user for canceled order ${orderId}`, 'warn')
          break
        }

        await cancelSubscriptionAndSync({
          userId,
          platform: 'paypal',
          externalId: orderId,
        })

        await PaymentModel.findOneAndUpdate(
          { billingToken: orderId },
          {
            $set: {
              status: 'failed',
              completedAt: new Date(),
            },
          },
        )

        auditLog('PAYPAL_WEBHOOK', 'Info', `Canceled PayPal subscription for user ${userId}`, 'info')
        break
      }

      default:
        auditLog('PAYPAL_WEBHOOK', 'Info', `Unhandled event ${eventType}`, 'info')
    }

    return res.status(200).json({ received: true })
  }),
)

router.use(requireAuth)

// ─── 1. CREATE PAYPAL ORDER ──────────────────────────────────────────────────
router.post(
  '/paypal/create-order',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    const user = await UserModel.findOne({ id: req.userId })
    if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản.')

    if (!env.paypalClientId || !env.paypalClientSecret) {
      throw new HttpError(500, 'Hệ thống chưa cấu hình PayPal API Key (PAYPAL_CLIENT_ID và PAYPAL_CLIENT_SECRET).')
    }

    try {
      const order = await createPayPalOrder({
        amountUSD: PRO_PLAN.priceUsd,
        description: `MedChat247 Pro Plan Subscription (${PRO_PLAN.durationDays} Days) - User: ${user.email}`,
        // Truyền userId qua custom để webhook có thể map về user khi nhận event
        custom: JSON.stringify({
          userId: user.id,
          planId: 'pro',
          source: 'web',
        }),
      })

      try {
        await PaymentModel.create({
          id: `pay_${randomUUID()}`,
          userId: user.id,
          planId: 'pro',
          amount: PRO_PLAN.priceVnd,
          status: 'pending',
          type: 'initial',
          paymentGateway: 'paypal',
          billingToken: order.id,
        })
      } catch (err) {
        auditLog('PAYPAL', 'Error', `Failed to persist pending order ${order.id}: ${err.message}`, 'error')
        throw new HttpError(500, 'Không thể khởi tạo bản ghi thanh toán.')
      }

      res.json({ orderId: order.id })
    } catch (err) {
      // Log the raw SDK/network error server-side; keep the client response
      // generic so internals do not leak.
      if (err instanceof HttpError) throw err
      auditLog('PAYPAL', 'Error', `Create order failed: ${err.message}`, 'error')
      throw new HttpError(500, 'Không thể tạo đơn hàng PayPal. Vui lòng thử lại sau.')
    }
  })
)

// ─── 2. CAPTURE PAYPAL ORDER & UPGRADE TO PRO ──────────────────────────────
router.post(
  '/paypal/capture-order',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    const { orderId } = req.body ?? {}
    if (!orderId || typeof orderId !== 'string') throw new HttpError(400, 'Thiếu PayPal Order ID hợp lệ.')

    const user = await UserModel.findOne({ id: req.userId })
    if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản.')

    if (!env.paypalClientId || !env.paypalClientSecret) {
      throw new HttpError(500, 'Hệ thống chưa cấu hình PayPal API Key.')
    }

    // 🛡️ CHỐNG TÁI SỬ DỤNG MÃ ĐƠN HÀNG (Anti-Replay Attack) & XỬ LÝ ĐỒNG BỘ NẾU WEBHOOK ĐÃ NHẬN TRƯỚC
    const existingPayment = await PaymentModel.findOne({
      paymentGateway: 'paypal',
      billingToken: orderId,
    })
    if (!existingPayment) {
      throw new HttpError(404, 'Không tìm thấy đơn hàng PayPal thuộc tài khoản hiện tại.')
    }
    if (existingPayment.userId !== user.id) {
      throw new HttpError(403, 'Đơn hàng PayPal không thuộc tài khoản hiện tại.')
    }
    if (existingPayment.status === 'success') {
      await syncUserProStatus(user.id)
      const updatedUser = await UserModel.findOne({ id: req.userId }).lean()
      return res.json({
        success: true,
        message: 'Thanh toán PayPal đã được xác nhận thành công trước đó! Gói Pro của bạn đã sẵn sàng.',
        user: toPublicUser(updatedUser),
      })
    }
    if (existingPayment.status !== 'pending') {
      throw new HttpError(400, 'Đơn hàng PayPal này đã được xử lý và ghi nhận trước đó.')
    }

    let captureResult
    try {
      captureResult = await capturePayPalOrder(orderId)
      if (captureResult.status !== 'COMPLETED') {
        throw new HttpError(400, `Thanh toán PayPal chưa hoàn tất (Trạng thái: ${captureResult.status})`)
      }

      const capturedAmount = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value
      const capturedCurrency = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code

      if (capturedAmount !== PRO_PLAN.priceUsd || capturedCurrency !== PRO_PLAN.currency) {
        console.error(`[PAYPAL AUDIT ALERT] Detected price mismatch for order ${orderId}: Expected ${PRO_PLAN.priceUsd} ${PRO_PLAN.currency}, got ${capturedAmount} ${capturedCurrency}`)
        throw new HttpError(400, `Giao dịch bị từ chối do số tiền thanh toán không đúng hạn mức gói Pro (${PRO_PLAN.priceUsd} ${PRO_PLAN.currency}).`)
      }
    } catch (err) {
      // Re-throw domain errors untouched; only wrap unexpected SDK/network
      // failures so their status and message are not flattened into a 400.
      if (err instanceof HttpError) throw err
      throw new HttpError(400, `Thanh toán PayPal thất bại: ${err.message}`)
    }

    const now = new Date()
    const paymentUpdated = await PaymentModel.findOneAndUpdate(
      {
        paymentGateway: 'paypal',
        billingToken: orderId,
        userId: user.id,
        status: 'pending',
      },
      {
        $set: {
          status: 'success',
          paypalCaptureId: captureResult.id || null,
          completedAt: now,
        },
      },
      { new: true },
    )
    if (!paymentUpdated) {
      // Webhook can mark the order successful while the browser callback is
      // still capturing it. Treat that verified state as an idempotent success
      // so the client receives the refreshed Pro account immediately.
      const completedPayment = await PaymentModel.findOne({
        paymentGateway: 'paypal',
        billingToken: orderId,
        userId: user.id,
        status: 'success',
      })
      if (completedPayment) {
        await syncUserProStatus(user.id)
        const updatedUser = await UserModel.findOne({ id: req.userId }).lean()
        return res.json({
          success: true,
          message: 'Thanh toán PayPal đã được xác nhận thành công. Gói Pro của bạn đã sẵn sàng.',
          user: toPublicUser(updatedUser),
        })
      }
      throw new HttpError(409, 'Đơn hàng PayPal đang được xử lý. Vui lòng thử lại sau ít phút.')
    }

    const expiresAt = new Date(now.getTime() + PRO_DURATION_MS)

    // Ghi subscription record + sync plan (dùng chung với webhook)
    await upsertSubscriptionAndSync({
      userId: user.id,
      platform: 'paypal',
      externalId: orderId,
      productId: 'pro',
      startedAt: now,
      expiresAt,
      autoRenew: true,
      metadata: {
        paypalPayerId: captureResult?.payer?.payer_id || null,
        paypalEmail: captureResult?.payer?.email_address || user.email,
        capturedAt: new Date().toISOString(),
        source: 'web',
      },
    })

    const updatedUser = await UserModel.findOne({ id: req.userId }).lean()

    res.json({
      success: true,
      message: 'Thanh toán thành công qua PayPal! Tài khoản của bạn đã được nâng cấp lên gói Pro (30 ngày).',
      user: toPublicUser(updatedUser)
    })
  })
)

// ─── 3. HỦY LIÊN KẾT THANH TOÁN ────────────────────────────────────────────
router.post(
  '/unlink',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    const updatedUser = await UserModel.findOneAndUpdate(
      { id: req.userId },
      {
        $set: {
          billingMethod: null,
          billingToken: null,
          billingDetails: null,
          autoRenew: false
        }
      },
      { new: true }
    ).lean()

    res.json({ success: true, user: toPublicUser(updatedUser) })
  })
)

// ─── 4. BẬT/TẮT TỰ ĐỘNG GIA HẠN ───────────────────────────────────────────
router.post(
  '/toggle-autorenew',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    const { autoRenew } = req.body ?? {}
    const updatedUser = await UserModel.findOneAndUpdate(
      { id: req.userId },
      { $set: { autoRenew: !!autoRenew } },
      { new: true }
    ).lean()

    res.json({ success: true, user: toPublicUser(updatedUser) })
  })
)

// ─── 5. LẤY LỊCH SỬ HÓA ĐƠN/GIAO DỊCH ─────────────────────────────────────
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const history = await PaymentModel.find({ userId: req.userId }).sort({ createdAt: -1 }).lean()
    res.json({ history })
  })
)

export default router
