import mongoose from 'mongoose'

const systemLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, enum: ['error', 'perf', 'cost'], required: true },
  message: { type: String, required: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
})

// Index on type and createdAt for fast querying
systemLogSchema.index({ type: 1, createdAt: -1 })

export const SystemLogModel = mongoose.model('SystemLog', systemLogSchema, 'system_logs')
