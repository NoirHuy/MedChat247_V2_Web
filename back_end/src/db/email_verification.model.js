import mongoose from 'mongoose'

const emailVerificationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  purpose: { type: String, required: true, enum: ['signup', 'password_reset'] },
  codeHash: { type: String, required: true },
  pendingName: { type: String, default: null },
  pendingPasswordHash: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, {
  timestamps: true,
  versionKey: false,
  collection: 'email_verifications',
})

emailVerificationSchema.index({ email: 1, purpose: 1 }, { unique: true })
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const EmailVerificationModel = mongoose.model('EmailVerification', emailVerificationSchema)
