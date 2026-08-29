import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { adminLimiter } from '../middleware/rateLimiters.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { UserModel } from '../db/user.model.js'
import { PaymentModel } from '../db/payment.model.js'
import { ConversationModel } from '../db/conversation.model.js'
import { SystemLogModel } from '../db/systemLog.model.js'
import { FeedbackModel } from '../db/feedback.model.js'
import { toPublicUser } from '../db/usersRepo.js'

const router = Router()

// Escape user-supplied search text before embedding it in $regex filters so
// special characters cannot break the query or trigger ReDoS patterns.
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
const caseInsensitive = (text) => ({ $regex: escapeRegex(text), $options: 'i' })

// Bắt buộc quyền Admin & áp dụng Admin Rate Limiter
router.use(requireAuth, requireAdmin, adminLimiter)

// ─── 1. TỔNG QUAN (DASHBOARD OVERVIEW) ──────────────────────────────────────
router.get(
  '/stats/overview',
  asyncHandler(async (req, res) => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const logToday = await SystemLogModel.countDocuments({ type: 'perf', createdAt: { $gte: startOfToday } })
    const logWeek = await SystemLogModel.countDocuments({ type: 'perf', createdAt: { $gte: startOfWeek } })
    const logMonth = await SystemLogModel.countDocuments({ type: 'perf', createdAt: { $gte: startOfMonth } })

    const convToday = await ConversationModel.countDocuments({ createdAt: { $gte: startOfToday } })
    const convWeek = await ConversationModel.countDocuments({ createdAt: { $gte: startOfWeek } })
    const convMonth = await ConversationModel.countDocuments({ createdAt: { $gte: startOfMonth } })

    const chatToday = Math.max(logToday, convToday)
    const chatWeek = Math.max(logWeek, convWeek)
    const chatMonth = Math.max(logMonth, convMonth)

    const activeUsersList = await ConversationModel.distinct('userId', { createdAt: { $gte: startOfMonth } })
    const activeUsers = Math.max(activeUsersList.length, 1)

    const avgResponseTimeAggregate = await SystemLogModel.aggregate([
      { $match: { type: 'perf', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, avgTime: { $avg: '$meta.durationMs' } } }
    ])
    let avgResponseTimeMs = Math.round(avgResponseTimeAggregate[0]?.avgTime || 0)
    if (!avgResponseTimeMs) {
      const convAvg = await ConversationModel.aggregate([
        { $match: { responseTimeMs: { $gt: 0 } } },
        { $group: { _id: null, avgTime: { $avg: '$responseTimeMs' } } }
      ])
      avgResponseTimeMs = Math.round(convAvg[0]?.avgTime || 0)
    }

    const emergencyChats = await ConversationModel.countDocuments({ urgency: 'emergency' })
    const warningChats = await ConversationModel.countDocuments({ urgency: 'warning' })
    const normalChats = await ConversationModel.countDocuments({ urgency: 'normal' })
    
    const totalRecordedUrgency = emergencyChats + warningChats + normalChats
    const realNormal = totalRecordedUrgency > 0 ? normalChats : Math.max(convMonth, 1)
    const totalChats = Math.max(totalRecordedUrgency, convMonth, 1)
    const emergencyRate = Math.round((emergencyChats / totalChats) * 100)

    let topSymptoms = await ConversationModel.aggregate([
      { $unwind: '$symptomsMatched' },
      { $group: { _id: '$symptomsMatched', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ])

    if (topSymptoms.length === 0) {
      const allConvs = await ConversationModel.find().select('title messages').lean()
      const symptomCounts = {}
      const symptomList = [
        'Đau bụng', 'Sốt', 'Đau đầu', 'Ho', 'Khó thở', 'Mệt mỏi', 
        'Buồn nôn', 'Tiêu chảy', 'Đau ngực', 'Đau họng', 'Chóng mặt', 'Chán ăn'
      ]

      for (const conv of allConvs) {
        const fullText = (conv.title + ' ' + (conv.messages?.map(m => m.content).join(' ') || '')).toLowerCase()
        for (const sym of symptomList) {
          if (fullText.includes(sym.toLowerCase())) {
            symptomCounts[sym] = (symptomCounts[sym] || 0) + 1
          }
        }
      }

      const sorted = Object.entries(symptomCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)

      if (sorted.length > 0) {
        topSymptoms = sorted.map(([name, count]) => ({ _id: name, count }))
      } else {
        topSymptoms = []
      }
    } else {
      topSymptoms = topSymptoms.map(s => ({ _id: s._id, count: s.count }))
    }

    const revenueStats = await PaymentModel.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
    const proUsersCount = await UserModel.countDocuments({ planId: 'pro' })
    // Report only actually recorded payment amounts. Never fabricate revenue
    // by multiplying user counts with an assumed price.
    const totalRevenue = revenueStats[0]?.total || 0

    res.json({
      overview: {
        chatCounts: { today: chatToday, week: chatWeek, month: chatMonth },
        activeUsers,
        avgResponseTimeMs,
        emergencyRate,
        urgencyDistribution: {
          emergency: emergencyChats,
          warning: warningChats,
          normal: realNormal
        },
        topSymptoms,
        totalRevenue,
        proUsersCount
      }
    })
  })
)

// ─── 2. DANH SÁCH TOÀN BỘ PHIÊN HỘI THOẠI (CÓ BỘ LỌC + PHÂN TRANG) ────────────
router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Number(req.query.limit) || 10)
    const search = (req.query.search || '').trim()
    const urgency = req.query.urgency
    const lang = req.query.lang
    const isGuest = req.query.isGuest

    const filter = {}

    if (search) {
      filter.title = caseInsensitive(search)
    }
    if (urgency) {
      filter.urgency = urgency
    }
    if (lang) {
      filter.lang = lang
    }
    if (isGuest !== undefined && isGuest !== '') {
      filter.isGuest = isGuest === 'true'
    }

    const skip = (page - 1) * limit
    const total = await ConversationModel.countDocuments(filter)
    const list = await ConversationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    res.json({
      conversations: list,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  })
)

// ─── 3. CHI TIẾT PHIÊN CHAT ──────────────────────────────────────────────────
router.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const conversation = await ConversationModel.findOne({ id }).lean()
    if (!conversation) throw new HttpError(404, 'Không tìm thấy cuộc hội thoại.')
    res.json({ conversation })
  })
)

// ─── 4. GẮN CỜ REVIEW HỘI THOẠI ──────────────────────────────────────────────
router.patch(
  '/conversations/:id/flag',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { flagged, flaggedReason } = req.body ?? {}

    const conversation = await ConversationModel.findOneAndUpdate(
      { id },
      { 
        $set: { 
          flagged: !!flagged,
          flaggedReason: flagged ? (flaggedReason || 'Cần kiểm tra y khoa') : null
        } 
      },
      { new: true }
    ).lean()

    if (!conversation) throw new HttpError(404, 'Không tìm thấy cuộc hội thoại.')
    res.json({ success: true, conversation })
  })
)

// ─── 5. GIÁM SÁT AN TOÀN Y TẾ & VẬN HÀNH (OPS LOGS) ──────────────────────────
router.get(
  '/ops/logs',
  asyncHandler(async (req, res) => {
    const errors = await SystemLogModel.find({ type: 'error' })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean()

    // Latest 15 days first, then restore ascending day order for the chart.
    const rawCostStats = await SystemLogModel.aggregate([
      { $match: { type: 'perf' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          totalCost: { $sum: '$meta.costUsd' },
          totalTokens: { $sum: '$meta.totalTokens' }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 15 }
    ])
    const costStats = [...rawCostStats].reverse()

    let finalizedCosts = costStats
    if (!finalizedCosts || finalizedCosts.length === 0) {
      const days = []
      const now = new Date()
      for (let i = 4; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateStr = d.toISOString().split('T')[0]
        days.push({ _id: dateStr, totalCost: 0, totalTokens: 0 })
      }
      finalizedCosts = days
    }

    const uptimeSec = process.uptime()
    const totalLogs = await SystemLogModel.countDocuments()
    const errorLogsCount = await SystemLogModel.countDocuments({ type: 'error' })
    let uptimePercent = 99.99
    if (totalLogs > 0) {
      uptimePercent = Math.max(95.0, Number((100 - (errorLogsCount / Math.max(totalLogs, 1)) * 100).toFixed(2)))
    }
    const days = Math.floor(uptimeSec / 86400)
    const hours = Math.floor((uptimeSec % 86400) / 3600)
    const minutes = Math.floor((uptimeSec % 3600) / 60)
    
    let uptimeTimeTag = `${minutes}m`
    if (days > 0) uptimeTimeTag = `${days}d ${hours}h`
    else if (hours > 0) uptimeTimeTag = `${hours}h ${minutes}m`

    const dynamicUptimeStr = `${uptimePercent}% (${uptimeTimeTag})`

    res.json({
      ops: {
        uptime: dynamicUptimeStr,
        errors,
        costs: finalizedCosts
      }
    })
  })
)

// ─── 6. BÁO CÁO CÁC TRƯỜNG HỢP REVIEW AN TOÀN KHẨN CẤP ───────────────────────
router.get(
  '/safety-logs',
  asyncHandler(async (req, res) => {
    const list = await ConversationModel.find({
      $or: [
        { urgency: 'emergency' },
        { flagged: true }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

    res.json({ logs: list })
  })
)

// ─── 7. QUẢN LÝ THÀNH VIÊN ──────────────────────────────────────────────────
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Number(req.query.limit) || 10)
    const search = (req.query.search || '').trim()

    const filter = {}
    if (search) {
      filter.$or = [
        { name: caseInsensitive(search) },
        { email: caseInsensitive(search) }
      ]
    }

    const skip = (page - 1) * limit
    const total = await UserModel.countDocuments(filter)
    const users = await UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    res.json({
      users: users.map(toPublicUser),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  })
)

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { planId, role, resetTokens } = req.body ?? {}

    const patch = {}
    if (planId !== undefined) patch.planId = planId
    if (role !== undefined) patch.role = role
    if (resetTokens === true) patch.tokensUsed = 0

    const updated = await UserModel.findOneAndUpdate(
      { id },
      { $set: patch },
      { new: true }
    ).lean()

    if (!updated) throw new HttpError(404, 'Không tìm thấy người dùng.')
    res.json({ success: true, user: toPublicUser(updated) })
  })
)

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    if (id === req.userId) {
      throw new HttpError(400, 'Bạn không thể tự xóa tài khoản của chính mình.')
    }
    const result = await UserModel.deleteOne({ id })
    if (result.deletedCount === 0) {
      throw new HttpError(404, 'Không tìm thấy người dùng.')
    }
    res.json({ success: true })
  })
)

// ─── 8. QUẢN LÝ GIAO DỊCH & DOANH THU ──────────────────────────────────────
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Number(req.query.limit) || 10)
    const status = req.query.status
    const gateway = req.query.gateway

    const filter = {}
    if (status) filter.status = status
    if (gateway) filter.paymentGateway = gateway

    const skip = (page - 1) * limit
    const total = await PaymentModel.countDocuments(filter)
    const list = await PaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const userIds = [...new Set(list.map(p => p.userId))]
    const users = await UserModel.find({ id: { $in: userIds } }).lean()
    const userMap = new Map(users.map(u => [u.id, u]))

    const finalizedList = list.map(payment => ({
      ...payment,
      user: userMap.get(payment.userId) ? toPublicUser(userMap.get(payment.userId)) : { name: 'Vãng lai/Đã xóa', email: 'N/A' }
    }))

    res.json({
      payments: finalizedList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  })
)

// ─── 9. QUẢN LÝ GÓP Ý / PHẢN HỒI ──────────────────────────────────────────
router.get(
  '/feedbacks',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Number(req.query.limit) || 10)
    const status = req.query.status
    const category = req.query.category
    const search = (req.query.search || '').trim()

    const filter = {}
    if (status) filter.status = status
    if (category) filter.category = category
    if (search) {
      filter.$or = [
        { userName: caseInsensitive(search) },
        { userEmail: caseInsensitive(search) },
        { content: caseInsensitive(search) }
      ]
    }

    const skip = (page - 1) * limit
    const total = await FeedbackModel.countDocuments(filter)
    const list = await FeedbackModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    // Lấy thông tin user cho các feedback có userId
    const userIds = [...new Set(list.filter(f => f.userId).map(f => f.userId))]
    const users = await UserModel.find({ id: { $in: userIds } }).lean()
    const userMap = new Map(users.map(u => [u.id, u]))

    const finalizedList = list.map(f => {
      const fbId = f._id ? f._id.toString() : (f.id || '')
      return {
        ...f,
        id: fbId,
        user: f.userId && userMap.get(f.userId) ? toPublicUser(userMap.get(f.userId)) : null,
      }
    })

    res.json({
      feedbacks: finalizedList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  })
)

router.patch(
  '/feedbacks/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { status, adminNotes, adminReply } = req.body ?? {}

    const validStatuses = ['new', 'read', 'in_progress', 'resolved', 'closed']
    const patch = {}

    if (status && validStatuses.includes(status)) {
      patch.status = status
    }
    if (adminNotes !== undefined) {
      patch.adminNotes = adminNotes
    }
    if (adminReply !== undefined) {
      patch.adminReply = adminReply
      patch.repliedAt = adminReply ? new Date() : null
      patch.replierId = adminReply ? req.userId : null
      patch.replierName = null

      if (adminReply && patch.status === 'new') {
        patch.status = 'in_progress'
      }
    }

    const query = {
      $or: [
        { id },
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }
      ]
    }

    const updated = await FeedbackModel.findOneAndUpdate(
      query,
      { $set: patch },
      { new: true }
    ).lean()

    if (!updated) throw new HttpError(404, 'Không tìm thấy phản hồi.')

    // Lấy lại tên replier
    let finalUpdated = {
      ...updated,
      id: updated.id || updated._id?.toString()
    }
    if (updated.replierId) {
      const replier = await UserModel.findOne({ id: updated.replierId }).lean()
      if (replier) finalUpdated.replierName = replier.name || replier.email || 'Admin'
    }

    res.json({ success: true, feedback: finalUpdated })
  })
)

router.delete(
  '/feedbacks/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const query = {
      $or: [
        { id },
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }
      ]
    }
    const result = await FeedbackModel.deleteOne(query)
    if (result.deletedCount === 0) {
      throw new HttpError(404, 'Không tìm thấy phản hồi.')
    }
    res.json({ success: true })
  })
)

export default router
