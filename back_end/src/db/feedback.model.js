import mongoose from 'mongoose'

const feedbackSchema = new mongoose.Schema({
  id: {
    type: String,
    sparse: true,
    index: true,
  },
  userId: {
    type: String,
    default: null,
    index: true,
  },
  userName: {
    type: String,
    default: 'Khách ẩn danh',
  },
  userEmail: {
    type: String,
    default: null,
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  category: {
    type: String,
    enum: ['bug', 'feature', 'question', 'complaint', 'other', 'help'],
    required: true,
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['new', 'read', 'in_progress', 'resolved', 'closed'],
    default: 'new',
  },
  adminNotes: {
    type: String,
    default: null,
  },
  adminReply: {
    type: String,
    default: null,
    maxlength: 2000,
  },
  repliedAt: {
    type: Date,
    default: null,
  },
  replierId: {
    type: String,
    default: null,
  },
  replierName: {
    type: String,
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  versionKey: false,
  timestamps: true,
})

feedbackSchema.index({ category: 1 })
feedbackSchema.index({ status: 1 })
feedbackSchema.index({ priority: 1 })
feedbackSchema.index({ createdAt: -1 })
feedbackSchema.index({ userId: 1, createdAt: -1 })

export const FeedbackModel = mongoose.model('Feedback', feedbackSchema, 'feedbacks')
