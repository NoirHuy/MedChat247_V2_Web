import rateLimit from 'express-rate-limit'
import { createRedisStore } from './redisStore.js'

const isDev = process.env.NODE_ENV !== 'production'

// Helper tạo response lỗi chuẩn HTTP 429 (khớp shape { error } của errorHandler)
const createRateLimitMessage = (msg) => ({
  error: msg,
})

// Helper to build a limiter backed by the shared Redis store (with automatic
// per-process in-memory fallback while Redis is unavailable).
function buildLimiter(options) {
  return rateLimit({ ...options, store: createRedisStore(options.windowMs) })
}

// ─── 1. AUTH RATE LIMITERS ──────────────────────────────────────────────────

// Chống Brute-force dò mật khẩu: Tối đa 10 lần sai / 15 phút (bỏ qua nếu đăng nhập thành công)
export const authSigninLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 10,
  skipSuccessfulRequests: true,
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage(
    'Bạn đã nhập sai mật khẩu nhiều lần. Để bảo vệ tài khoản, vui lòng thử lại sau ít phút.'
  ),
})

// Chống Spam tạo tài khoản rác: Tối đa 5 lần đăng ký / 1 giờ
export const authSignupLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 100 : 5,
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage(
    'Số lần đăng ký tài khoản từ thiết bị này đã đạt giới hạn. Vui lòng quay lại sau 1 giờ.'
  ),
})

// Gửi và xác minh mã OTP email: giảm spam email và brute-force mã 6 chữ số
export const authEmailCodeLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 10,
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Bạn đã yêu cầu hoặc nhập mã quá nhiều lần. Vui lòng thử lại sau 15 phút.'),
})

// Đăng nhập Google OAuth: Tối đa 30 lần / 15 phút (bỏ qua nếu đăng nhập thành công)
export const authGoogleLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 30,
  skipSuccessfulRequests: true,
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage(
    'Thao tác đăng nhập Google quá tần suất. Vui lòng thử lại sau ít phút.'
  ),
})

// Lấy cấu hình & Signout: Tối đa 30 lần / 1 phút
export const authGeneralLimiter = buildLimiter({
  windowMs: 1 * 60 * 1000,
  max: isDev ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Tần suất truy cập quá nhanh. Vui lòng thử lại sau.'),
})

// ─── 2. CHAT & AI LLM RATE LIMITERS ────────────────────────────────────────

// Giới hạn Khách vãng lai (Guest): Tối đa 5 câu hỏi / 1 giờ
export const guestChatLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 5,
  skip: (req) => !!req.userId, // Bỏ qua nếu đã đăng nhập tài khoản
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage(
    'Vui lòng [Đăng nhập](#auth/signin) hoặc [Đăng ký tài khoản miễn phí](#auth/signup) để tiếp tục chat và trải nghiệm đầy đủ tính năng AI Y tế!'
  ),
})

// Giới hạn Thành viên đã đăng nhập: Tối đa 60 câu hỏi / 15 phút chống spam bot
export const memberChatLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 60,
  skip: (req) => !req.userId, // Bỏ qua nếu chưa đăng nhập
  keyGenerator: (req) => String(req.userId),
  validate: { ip: false, xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage(
    'Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau ít phút.'
  ),
})

// Tạo tiêu đề tự động: Tối đa 20 lần / 15 phút
export const chatTitleLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Tần suất tạo tiêu đề tự động quá nhanh.'),
})

// Lấy / Tạo / Xóa danh sách hội thoại: Tối đa 60 lần / 1 phút
export const chatGeneralLimiter = buildLimiter({
  windowMs: 1 * 60 * 1000,
  max: isDev ? 300 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Thao tác hội thoại quá tần suất. Vui lòng thử lại.'),
})

// ─── 3. ACCOUNT & PROFILE RATE LIMITERS ─────────────────────────────────────

// Đổi mật khẩu: Tối đa 5 lần / 15 phút
export const accountPasswordLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 50 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Số lần đổi mật khẩu vượt quá quy định. Vui lòng thử lại sau 15 phút.'),
})

// Cập nhật hồ sơ & Thẻ thanh toán: Tối đa 15 lần / 15 phút
export const accountGeneralLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 150 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Thao tác cập nhật tài khoản quá nhanh. Vui lòng chờ ít phút.'),
})

// ─── 4. MEMORIES RATE LIMITERS ─────────────────────────────────────────────

// Quản lý ký ức y tế: Tối đa 60 lần / 1 phút
export const memoriesLimiter = buildLimiter({
  windowMs: 1 * 60 * 1000,
  max: isDev ? 300 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Thao tác cập nhật ký ức y tế quá nhanh.'),
})

// ─── 5. PAYMENT RATE LIMITERS ──────────────────────────────────────────────

// Tạo & xác nhận đơn hàng PayPal: Tối đa 5 lần / 15 phút
export const paymentLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 50 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage(
    'Khởi tạo đơn hàng thanh toán quá nhiều lần. Vui lòng thử lại sau 15 phút.'
  ),
})

// ─── 6. ADMIN DASHBOARD RATE LIMITERS ──────────────────────────────────────

// Bảng điều khiển Quản trị Admin: Tối đa 100 lần / 1 phút
export const adminLimiter = buildLimiter({
  windowMs: 1 * 60 * 1000,
  max: isDev ? 500 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: createRateLimitMessage('Tần suất truy cập trang quản trị vượt quá giới hạn an toàn.'),
})