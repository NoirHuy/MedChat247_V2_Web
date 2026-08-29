import mongoose from 'mongoose'

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['paypal', 'google_play', 'apple_iap'],
    required: true,
  },
  externalId: {
    type: String,
    required: true,
    index: true,
  },
  productId: {
    type: String,
    required: true,
  },
  autoRenew: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ['active', 'past_due', 'canceled', 'expired'],
    default: 'active',
  },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  canceledAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  versionKey: false,
  timestamps: true,
})

subscriptionSchema.index({ userId: 1, platform: 1, externalId: 1 }, { unique: true })

export const SubscriptionModel = mongoose.model(
  'Subscription',
  subscriptionSchema,
  'subscriptions',
)
