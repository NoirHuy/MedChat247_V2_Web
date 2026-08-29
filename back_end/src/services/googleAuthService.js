import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env.js'
import { HttpError } from '../utils/httpError.js'

const client = env.googleClientId ? new OAuth2Client(env.googleClientId) : null

// Verifies a Google Identity Services credential (ID token JWT) sent by the
// frontend's real "Sign in with Google" button. This cryptographically
// checks the token's signature, expiry, and audience (our client id)
// against Google's public keys — unlike the demo fallback in auth.routes.js,
// nothing here trusts client-supplied data.
export async function verifyGoogleCredential(credential) {
  if (!client) {
    throw new HttpError(500, 'GOOGLE_CLIENT_ID chưa được cấu hình trên máy chủ.')
  }
  if (!credential) {
    throw new HttpError(400, 'Thiếu credential Google.')
  }

  let payload
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    })
    payload = ticket.getPayload()
  } catch (err) {
    throw new HttpError(401, `Xác thực Google thất bại: ${err.message}`)
  }

  if (!payload?.email) {
    throw new HttpError(401, 'Google không trả về email hợp lệ.')
  }
  if (!payload.email_verified) {
    throw new HttpError(401, 'Email Google này chưa được xác minh.')
  }

  return {
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || null,
  }
}
