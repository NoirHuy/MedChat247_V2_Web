import { env } from '../config/env.js'
import { auditLog } from '../utils/auditLog.js'

let cachedToken = null
let tokenExpiresAt = 0

/**
 * Obtain OAuth2 Access Token from PayPal REST API
 */
export async function getPayPalAccessToken() {
  if (!env.paypalClientId || !env.paypalClientSecret) {
    throw new Error('PayPal Client ID or Secret is not configured in environment variables.')
  }

  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken
  }

  const authHeader = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString('base64')
  
  const response = await fetch(`${env.paypalApiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const errorText = await response.text()
    auditLog('PAYPAL', 'Error', `Failed to obtain access token: ${errorText}`, 'error')
    throw new Error(`PayPal OAuth authentication failed: ${response.statusText}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  tokenExpiresAt = now + (data.expires_in * 1000)
  return cachedToken
}

/**
 * Create a PayPal Checkout Order (v2)
 * Default amount $3.99 USD (~99,000 VND)
 *
 * `custom` (string): JSON-encoded metadata gắn vào order, PayPal sẽ gửi lại
 *                    trong webhook event. Dùng để truyền userId, planId,...
 */
export async function createPayPalOrder({
  amountUSD = '3.99',
  description = 'MedChat247 Pro Subscription (30 Days)',
  custom = null,
} = {}) {
  const accessToken = await getPayPalAccessToken()

  const purchaseUnit = {
    amount: {
      currency_code: 'USD',
      value: String(amountUSD),
    },
    description,
  }

  if (custom) {
    purchaseUnit.custom = custom
  }

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [purchaseUnit],
    application_context: {
      brand_name: 'MedChat247 AI',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
    },
  }

  const response = await fetch(`${env.paypalApiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    auditLog('PAYPAL', 'Error', `Failed to create order: ${errorText}`, 'error')
    throw new Error(`PayPal Create Order failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data
}

/**
 * Capture payment for a PayPal Checkout Order
 */
export async function capturePayPalOrder(orderId) {
  if (!orderId) {
    throw new Error('PayPal Order ID is required for capture.')
  }

  const accessToken = await getPayPalAccessToken()

  const response = await fetch(`${env.paypalApiBase}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    auditLog('PAYPAL', 'Error', `Failed to capture order ${orderId}: ${errorText}`, 'error')
    throw new Error(`PayPal Capture Order failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data
}
