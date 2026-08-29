import { Router } from 'express'
import crypto from 'node:crypto'
import { FeedbackModel } from '../db/feedback.model.js'
import { UserModel } from '../db/user.model.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Pseudonymize client metadata: we only need abuse dedup, not the raw PII,
// so store a salted hash instead of the plain IP address (ND13-friendly).
const IP_HASH_SALT = process.env.FEEDBACK_IP_SALT || 'medchat247-feedback-salt'
function hashIp(ip) {
  if (!ip) return null
  return crypto.createHash('sha256').update(`${IP_HASH_SALT}:${ip}`).digest('hex').slice(0, 32)
}

// ─── USER ROUTES ────────────────────────────────────────────────────────────

// POST /api/feedback — Gửi góp ý (yêu cầu đăng nhập)
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { content, category, priority, isAnonymous } = req.body ?? {}

    if (!content?.trim()) {
      throw new HttpError(400, 'Nội dung phản hồi không được để trống.')
    }
    if (content.trim().length > 2000) {
      throw new HttpError(400, 'Nội dung phản hồi không được vượt quá 2000 ký tự.')
    }
    if (!category || !['bug', 'feature', 'question', 'complaint', 'other', 'help'].includes(category)) {
      throw new HttpError(400, 'Loại phản hồi không hợp lệ.')
    }

    // Lấy thông tin user từ DB
    const user = await UserModel.findOne({ id: req.userId }).lean()
    if (!user) {
      throw new HttpError(404, 'Không tìm thấy tài khoản.')
    }

    const doAnonymous = isAnonymous === true
    const feedback = new FeedbackModel({
      userId: req.userId,
      userName: doAnonymous ? 'Khách ẩn danh' : (user.name || user.email || 'Người dùng'),
      userEmail: doAnonymous ? null : (user.email || null),
      content: content.trim(),
      category,
      isAnonymous: doAnonymous,
      priority: ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium',
      status: 'new',
      metadata: {
        ipHash: hashIp(req.ip || req.connection?.remoteAddress),
        userAgent: req.get('User-Agent') || null,
      },
    })
    feedback.id = feedback._id.toString()

    await feedback.save()

    return res.status(201).json({
      success: true,
      message: 'Gửi phản hồi thành công! Cảm ơn bạn đã đóng góp ý kiến.',
      feedback: {
        id: feedback.id,
        category: feedback.category,
        status: feedback.status,
        createdAt: feedback.createdAt,
        adminReply: feedback.adminReply,
        repliedAt: feedback.repliedAt,
      },
    })
  }),
)

// GET /api/feedback/me — Lịch sử góp ý của user (yêu cầu đăng nhập)
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [feedbacksRaw, total] = await Promise.all([
      FeedbackModel.find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      FeedbackModel.countDocuments({ userId: req.userId }),
    ])

    const feedbacks = feedbacksRaw.map(f => ({
      ...f,
      id: f.id || f._id?.toString(),
    }))

    return res.json({
      feedbacks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    })
  }),
)

export default router
