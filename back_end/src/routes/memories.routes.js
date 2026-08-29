import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { memoriesLimiter } from '../middleware/rateLimiters.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { UserMemoryModel } from '../db/user_memory.model.js'
import { UserMemorySettingsModel, getUserMemorySettings } from '../db/user_memory_settings.model.js'
import { logMemoryAudit } from '../db/memory_audit.model.js'
import { encryptText, decryptText } from '../utils/memoryCrypto.js'

const router = Router()
router.use(requireAuth)
router.use(memoriesLimiter)

// ─── 1. LẤY DANH SÁCH HỒ SƠ TRÍ NHỚ ĐÃ GIẢI MÃ ─────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const list = await UserMemoryModel.find({
      userId: req.userId,
      status: { $ne: 'deleted' },
    })
      .sort({ createdAt: -1 })
      .lean()

    // Skip records whose ciphertext can no longer be decrypted (key rotated /
    // corrupted) instead of leaking raw ciphertext to the client.
    const decryptedList = list
      .map(m => ({ ...m, content: decryptText(m.content) }))
      .filter(m => m.content !== null)

    res.json({ memories: decryptedList })
  })
)

// ─── 2. LẤY & CẬP NHẬT CÀI ĐẶT TRÍ NHỚ (PHẢI ĐẶT TRƯỚC /:id) ───────────────
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await getUserMemorySettings(req.userId)
    res.json({ settings })
  })
)

router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const { memoryEnabled, autoRememberAllergies, autoRememberChronic, autoRememberMedications, autoRememberEpisodes } = req.body ?? {}
    const patch = {}

    if (memoryEnabled !== undefined) patch.memoryEnabled = Boolean(memoryEnabled)
    if (autoRememberAllergies !== undefined) patch.autoRememberAllergies = Boolean(autoRememberAllergies)
    if (autoRememberChronic !== undefined) patch.autoRememberChronic = Boolean(autoRememberChronic)
    if (autoRememberMedications !== undefined) patch.autoRememberMedications = Boolean(autoRememberMedications)
    if (autoRememberEpisodes !== undefined) patch.autoRememberEpisodes = Boolean(autoRememberEpisodes)

    const updated = await UserMemorySettingsModel.findOneAndUpdate(
      { userId: req.userId },
      { $set: patch },
      { new: true, upsert: true }
    ).lean()

    res.json({ settings: updated })
  })
)

// ─── 3. XUẤT TỆP TÓM TẮT HỒ SƠ Y TẾ (.TXT) (PHẢI ĐẶT TRƯỚC /:id) ───────────
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const list = await UserMemoryModel.find({
      userId: req.userId,
      status: 'active',
    }).lean()

    const decryptedList = list
      .map(m => ({ ...m, content: decryptText(m.content) }))
      .filter(m => m.content !== null)

    const categoriesMap = {
      allergy: 'DỊ ỨNG THUỐC & THỨC ĂN',
      chronic_condition: 'BỆNH NỀN MÃN TÍNH',
      medication: 'THUỐC ĐANG SỬ DỤNG',
      blood_type: 'NHÓM MÁU',
      pregnancy: 'THÔNG TIN THAI KỲ',
      past_episode: 'ĐỢT BỆNH KHÁM TRƯỚC',
      lifestyle: 'LỐI SỐNG & TIỀN SỬ GIA ĐÌNH',
      display_preference: 'SỞ THÍCH HIỂN THỊ',
    }

    let textContent = `=====================================================\n`
    textContent += `   HỒ SƠ TÓM TẮT TIỀN SỬ Y TẾ CÁ NHÂN - MEDCHAT247 AI   \n`
    textContent += `=====================================================\n`
    textContent += `Thời gian xuất tệp: ${new Date().toLocaleString('vi-VN')}\n`
    textContent += `Mã người dùng: ${req.userId}\n`
    textContent += `-----------------------------------------------------\n\n`

    Object.keys(categoriesMap).forEach(cat => {
      const items = decryptedList.filter(m => m.category === cat)
      if (items.length > 0) {
        textContent += `▶ ${categoriesMap[cat]}:\n`
        items.forEach(item => {
          const subjectTag = item.subject === 'family' ? '[Tiền sử gia đình] ' : ''
          textContent += `  • ${subjectTag}${item.content} (Ngày ghi nhận: ${new Date(item.createdAt).toLocaleDateString('vi-VN')})\n`
        })
        textContent += `\n`
      }
    })

    textContent += `-----------------------------------------------------\n`
    textContent += `⚠️ KHUYẾN CÁO: Tệp này chứa tóm tắt tiền sử y tế cá nhân được tổng hợp tự động từ các phiên tham vấn với MedChat247. Thông tin này chỉ mang tính tham khảo cho bác sĩ chuyên khoa và KHÔNG thay thế hồ sơ bệnh án chính thức.\n`

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="Ho_So_Tri_Nho_Y_Te_MedChat247.txt"')
    res.send(textContent)
  })
)

// ─── 4. THÊM TRÍ NHỚ THỦ CÔNG ───────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { content, category, memoryType = 'fact', subject = 'self', importance = 'medium' } = req.body ?? {}
    if (!content || !content.trim()) throw new HttpError(400, 'Nội dung trí nhớ không được để trống.')
    if (!category) throw new HttpError(400, 'Danh mục trí nhớ không được để trống.')

    const encrypted = encryptText(content.trim())
    let expiresAt = null
    if (category === 'past_episode') {
      expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }

    const memory = await UserMemoryModel.create({
      userId: req.userId,
      category,
      memoryType,
      content: encrypted,
      keyVersion: 1,
      status: 'active',
      subject,
      importance,
      medicalStatus: 'confirmed',
      confidence: 1.0,
      source: 'manual',
      isLocked: true,
      version: 1,
      extractedAt: new Date(),
      lastConfirmedAt: new Date(),
      verificationStatus: 'verified',
      expiresAt,
    })

    const decrypted = {
      ...memory.toObject(),
      content: content.trim(),
    }

    await logMemoryAudit({
      memoryId: memory.id,
      userId: req.userId,
      action: 'create',
      performedBy: 'user',
      newContent: content.trim(),
    })

    res.status(201).json({ memory: decrypted })
  })
)

// ─── 5. XÓA MỀM TOÀN BỘ TRÍ NHỚ ──────────────────────────────────────────────
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await UserMemoryModel.updateMany(
      { userId: req.userId, status: { $ne: 'deleted' } },
      { $set: { status: 'deleted' } }
    )

    await logMemoryAudit({
      memoryId: 'all',
      userId: req.userId,
      action: 'delete',
      performedBy: 'user',
      meta: { message: 'Clear all user memories' },
    })

    res.json({ success: true, message: 'Đã xóa toàn bộ hồ sơ trí nhớ.' })
  })
)

// ─── 6. CẬP NHẬT MỘT MỤC TRÍ NHỚ CHÍNH XÁC THEO ID ─────────────────────────
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { content, isLocked, status } = req.body ?? {}

    const memory = await UserMemoryModel.findOne({ id, userId: req.userId })
    if (!memory) throw new HttpError(404, 'Không tìm thấy mục trí nhớ.')

    // Null means the stored ciphertext is undecryptable; treat the previous
    // content as empty so any user-supplied edit overwrites it.
    const previousDecrypted = decryptText(memory.content) ?? ''
    const patch = {}

    if (content !== undefined && content.trim() !== previousDecrypted) {
      patch.content = encryptText(content.trim())
      patch.version = (memory.version || 1) + 1
      patch.lastConfirmedAt = new Date()
      patch.verificationStatus = 'verified'
    }

    if (isLocked !== undefined) {
      patch.isLocked = Boolean(isLocked)
    }

    if (status !== undefined) {
      patch.status = status
    }

    const updated = await UserMemoryModel.findOneAndUpdate(
      { id, userId: req.userId },
      { $set: patch },
      { new: true }
    ).lean()

    // Concurrent soft-delete between the lookup above and this update makes
    // `updated` null; surface a 404 instead of crashing with a TypeError.
    if (!updated) throw new HttpError(404, 'Không tìm thấy mục trí nhớ.')

    const decryptedContent = decryptText(updated.content)
    if (decryptedContent === null) {
      throw new HttpError(500, 'Dữ liệu trí nhớ không thể giải mã. Vui lòng xóa và tạo lại mục này.')
    }
    const decrypted = { ...updated, content: decryptedContent }

    await logMemoryAudit({
      memoryId: id,
      userId: req.userId,
      action: content !== undefined ? 'edit' : isLocked !== undefined ? (isLocked ? 'lock' : 'unlock') : 'edit',
      performedBy: 'user',
      previousContent: previousDecrypted,
      newContent: decrypted.content,
    })

    res.json({ memory: decrypted })
  })
)

// ─── 7. XÓA MỀM MỘT MỤC TRÍ NHỚ ─────────────────────────────────────────────
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const memory = await UserMemoryModel.findOne({ id, userId: req.userId })
    if (!memory) throw new HttpError(404, 'Không tìm thấy mục trí nhớ.')

    await UserMemoryModel.updateOne(
      { id, userId: req.userId },
      { $set: { status: 'deleted' } }
    )

    await logMemoryAudit({
      memoryId: id,
      userId: req.userId,
      action: 'delete',
      performedBy: 'user',
      previousContent: decryptText(memory.content) ?? '',
    })

    res.json({ success: true, message: 'Đã xóa mục trí nhớ.' })
  })
)

export default router
