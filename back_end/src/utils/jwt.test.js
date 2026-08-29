import { describe, expect, it } from 'vitest'
import {
  signMobileAccessToken,
  signMobileRefreshToken,
  signSessionToken,
  verifyMobileRefreshToken,
  verifySessionToken,
} from './jwt.js'

describe('token types', () => {
  it('accepts web and mobile access tokens for authenticated requests', () => {
    const web = signSessionToken('user-1')
    const mobile = signMobileAccessToken('user-2')
    // web_session returns { userId, jti } so we can revoke it
    expect(verifySessionToken(web.token)).toEqual({ userId: 'user-1', jti: expect.any(String) })
    // mobile_access returns { userId } only — no jti because it is short-lived
    // and cannot be individually revoked; the revocation check is a no-op.
    expect(verifySessionToken(mobile)).toEqual({ userId: 'user-2' })
  })

  it('does not accept a refresh token as an API credential', () => {
    const refresh = signMobileRefreshToken('user-1')
    expect(verifySessionToken(refresh.token)).toBeNull()
    expect(verifyMobileRefreshToken(refresh.token)).toMatchObject({ userId: 'user-1', tokenId: refresh.tokenId })
  })
})
