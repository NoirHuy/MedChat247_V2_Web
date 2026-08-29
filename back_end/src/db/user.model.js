import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, default: null },
  provider: { type: String, required: true },
  picture: { type: String, default: null },
  planId: { type: String, required: true },
  tokensUsed: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  subscriptionExpiresAt: { type: Date, default: null },
  subscriptionStatus: { type: String, enum: ['active', 'past_due', 'canceled', 'none'], default: 'none' },
  autoRenew: { type: Boolean, default: false },
  billingMethod: { type: String, enum: ['stripe', 'momo', null], default: null },
  billingToken: { type: String, default: null },
  billingDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
}, {
  versionKey: false,
})

// Mongoose model mapping to the 'users' collection
export const UserModel = mongoose.model('User', userSchema, 'users')
