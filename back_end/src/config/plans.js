// Mirrors src/data/account.js on the frontend. Keep the ids, token limits and
// pricing in sync with that file.
export const DEFAULT_PLAN_ID = 'free'

export const PLANS = [
  { id: 'free', tokenLimit: 500000000 },
  {
    id: 'pro',
    tokenLimit: 2000000000,
    // PayPal order pricing — single source of truth for create-order, the
    // capture check and webhook amount validation.
    priceUsd: '3.99',
    currency: 'USD',
    priceVnd: 99000,
    durationDays: 30,
  },
]

export function getPlan(planId) {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0]
}

export function isValidPlanId(planId) {
  return PLANS.some((p) => p.id === planId)
}

export const PRO_PLAN = getPlan('pro')

// Pro subscription term in milliseconds.
export const PRO_DURATION_MS = PRO_PLAN.durationDays * 24 * 60 * 60 * 1000
