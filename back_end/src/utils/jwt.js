import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'

const SESSION_EXPIRES_IN = '7d'
const MOBILE_ACCESS_EXPIRES_IN = '15m'
const MOBILE_REFRESH_EXPIRES_IN = '30d'
export const AUTH_COOKIE_NAME = 'medchat_token'

export function signSessionToken(userId) {
  const jti = randomUUID()
  const token = jwt.sign({ sub: userId, type: 'web_session', jti }, env.jwtSecret, { expiresIn: SESSION_EXPIRES_IN })
  return { token, jti }
}

export function signMobileAccessToken(userId) {
  return jwt.sign({ sub: userId, type: 'mobile_access' }, env.jwtSecret, { expiresIn: MOBILE_ACCESS_EXPIRES_IN })
}

export function signMobileRefreshToken(userId) {
  const tokenId = randomUUID()
  const token = jwt.sign({ sub: userId, type: 'mobile_refresh', jti: tokenId }, env.jwtSecret, {
    expiresIn: MOBILE_REFRESH_EXPIRES_IN,
  })
  return {
    token,
    tokenId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }
}

export function verifySessionToken(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret)
    if (payload.type === 'mobile_refresh') return null
    // Normalize every accepted token type into { userId, jti? } so callers
    // (e.g. verifyTokenWithRevocationCheck) can read `.userId` uniformly.
    // `mobile_access` has no jti because it is short-lived and cannot be
    // individually revoked; the revocation check in middleware already
    // short-circuits when `jti` is absent.
    if (payload.type === 'mobile_access') return { userId: payload.sub }
    // Web session token: include jti so callers can revoke the session.
    return { userId: payload.sub, jti: payload.jti }
  } catch {
    return null
  }
}

export function verifyMobileRefreshToken(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret)
    if (payload.type !== 'mobile_refresh' || !payload.sub || !payload.jti) return null
    return { userId: payload.sub, tokenId: payload.jti }
  } catch {
    return null
  }
}
