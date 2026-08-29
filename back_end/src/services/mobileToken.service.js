import { MobileRefreshTokenModel } from '../db/mobile_refresh_token.model.js'
import {
  signMobileAccessToken,
  signMobileRefreshToken,
  verifyMobileRefreshToken,
} from '../utils/jwt.js'

export async function issueMobileTokens(userId) {
  const refresh = signMobileRefreshToken(userId)
  await MobileRefreshTokenModel.create({
    tokenId: refresh.tokenId,
    userId,
    expiresAt: refresh.expiresAt,
  })
  return {
    accessToken: signMobileAccessToken(userId),
    refreshToken: refresh.token,
    accessTokenExpiresIn: 15 * 60,
    refreshTokenExpiresIn: 30 * 24 * 60 * 60,
  }
}

export async function rotateMobileRefreshToken(refreshToken) {
  const payload = verifyMobileRefreshToken(refreshToken)
  if (!payload) return null

  const consumed = await MobileRefreshTokenModel.findOneAndUpdate(
    {
      tokenId: payload.tokenId,
      userId: payload.userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date() } },
    { new: true },
  ).lean()
  if (!consumed) return null

  return issueMobileTokens(payload.userId)
}

export async function revokeMobileRefreshToken(userId, refreshToken) {
  const payload = verifyMobileRefreshToken(refreshToken)
  if (!payload || payload.userId !== userId) return false

  const result = await MobileRefreshTokenModel.updateOne(
    { tokenId: payload.tokenId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  return result.modifiedCount === 1
}
