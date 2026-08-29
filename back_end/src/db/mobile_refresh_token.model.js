import mongoose from 'mongoose'

const mobileRefreshTokenSchema = new mongoose.Schema({
  tokenId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, {
  versionKey: false,
  timestamps: true,
  collection: 'mobile_refresh_tokens',
})

mobileRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const MobileRefreshTokenModel = mongoose.model(
  'MobileRefreshToken',
  mobileRefreshTokenSchema,
)
