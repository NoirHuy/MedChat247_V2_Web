import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  planId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  type: { type: String, enum: ['initial', 'recurring'], default: 'initial' },
  paymentGateway: { type: String, enum: ['paypal', 'stripe', 'momo', 'google_play', 'apple_iap'], required: true },
  billingToken: { type: String, default: null, index: true },
  paypalCaptureId: { type: String, default: null, index: true },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
}, {
  versionKey: false,
})

paymentSchema.index(
  { paymentGateway: 1, billingToken: 1 },
  {
    unique: true,
    partialFilterExpression: {
      paymentGateway: 'paypal',
      billingToken: { $type: 'string' },
    },
  },
)

export const PaymentModel = mongoose.model('Payment', paymentSchema, 'payments')
