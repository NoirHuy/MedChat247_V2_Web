import { env } from '../config/env.js'
import { getPayPalAccessToken } from '../services/paypalClient.js'
import { auditLog } from './auditLog.js'

/**
 * Verify PayPal webhook signature theo REST API chính thức.
 * Docs: https://developer.paypal.com/api/rest/webhooks/event-names/
 *
 * Flow:
 *  1. Đọc headers: paypal-auth-algo, paypal-cert-url, paypal-transmission-id,
 *                  paypal-transmission-sig, paypal-transmission-time
 *  2. Gọi PayPal API /v1/notifications/verify với toàn bộ thông tin trên + webhook_id + event
 *  3. Nếu verification_status === 'SUCCESS' → hợp lệ
 */
export async function verifyPayPalWebhookSignature(headers, eventBody) {
  if (!env.paypalWebhookId) {
    auditLog('PAYPAL_WEBHOOK', 'Error', 'PAYPAL_WEBHOOK_ID is not configured', 'error')
    return { valid: false, reason: 'Webhook ID not configured' }
  }

  const authAlgo = headers['paypal-auth-algo']
  const certUrl = headers['paypal-cert-url']
  const transmissionId = headers['paypal-transmission-id']
  const transmissionSig = headers['paypal-transmission-sig']
  const transmissionTime = headers['paypal-transmission-time']

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return { valid: false, reason: 'Missing required PayPal headers' }
  }

  // Chỉ chấp nhận cert URL từ PayPal official
  const allowedCertPrefixes = ['https://api.paypal.com/', 'https://api.sandbox.paypal.com/']
  if (!allowedCertPrefixes.some((p) => certUrl.startsWith(p))) {
    return { valid: false, reason: 'Untrusted cert URL' }
  }

  const payload = {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: env.paypalWebhookId,
    webhook_event: eventBody,
  }

  try {
    const accessToken = await getPayPalAccessToken()
    const response = await fetch(`${env.paypalApiBase}/v1/notifications/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text()
      auditLog('PAYPAL_WEBHOOK', 'Error', `Verify API failed: ${errText}`, 'error')
      return { valid: false, reason: 'PayPal verify API call failed' }
    }

    const result = await response.json()
    return {
      valid: result.verification_status === 'SUCCESS',
      reason: result.verification_status || 'Unknown',
    }
  } catch (err) {
    auditLog('PAYPAL_WEBHOOK', 'Error', `Exception: ${err.message}`, 'error')
    return { valid: false, reason: err.message }
  }
}

/**
 * Parse custom field (JSON string) an toàn, trả về {} nếu fail.
 */
export function parsePayPalCustom(custom) {
  if (!custom || typeof custom !== 'string') return {}
  try {
    return JSON.parse(custom)
  } catch {
    return {}
  }
}
