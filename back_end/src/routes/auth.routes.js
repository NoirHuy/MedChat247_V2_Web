import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { AUTH_COOKIE_NAME, signSessionToken, verifySessionToken } from '../utils/jwt.js'
import { requireAuth } from '../middleware/auth.js'
import {
  authSigninLimiter,
  authSignupLimiter,
  authEmailCodeLimiter,
  authGoogleLimiter,
  authGeneralLimiter,
} from '../middleware/rateLimiters.js'
import { env } from '../config/env.js'
import { DEFAULT_PLAN_ID } from '../config/plans.js'
import { verifyGoogleCredential } from '../services/googleAuthService.js'
import {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
  toPublicUser,
} from '../db/usersRepo.js'
import {
  issueMobileTokens,
  revokeMobileRefreshToken,
  rotateMobileRefreshToken,
} from '../services/mobileToken.service.js'
import { syncUserProStatus } from '../services/subscription.service.js'
import { issueEmailVerification, verifyEmailCode } from '../services/emailVerification.service.js'
import { storeSession, revokeSession, revokeAllUserSessions } from '../services/auth/authCache.js'
import { hashPassword, verifyPassword } from '../utils/passwordHash.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isSecureCookie = env.cookieSecure
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isSecureCookie,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

function setSessionCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS)
}

function isMobileClient(req) {
  return req.body?.client === 'mobile'
}

async function sendAuthenticated(res, req, user, status = 200) {
  if (isMobileClient(req)) {
    const tokens = await issueMobileTokens(user.id)
    return res.status(status).json({ user: toPublicUser(user), tokens })
  }
  const { token, jti } = signSessionToken(user.id)
  await storeSession(jti, { userId: user.id, email: user.email, createdAt: Date.now() })
  setSessionCookie(res, token)
  return res.status(status).json({ user: toPublicUser(user) })
}

router.get(
  '/config',
  authGeneralLimiter,
  asyncHandler(async (_req, res) => {
    res.json({
      googleClientId: env.googleClientId || null,
    })
  }),
)

router.post(
  '/signup',
  authSignupLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body ?? {}
    const trimmedName = (name ?? '').trim()
    const trimmedEmail = (email ?? '').trim().toLowerCase()

    if (!trimmedName) throw new HttpError(400, 'Vui long nhap ho ten.')
    if (!EMAIL_RE.test(trimmedEmail)) throw new HttpError(400, 'Email khong hop le.')
    if (!password || password.length < 6) {
      throw new HttpError(400, 'Mat khau can toi thieu 6 ky tu.')
    }
    if (await findUserByEmail(trimmedEmail)) {
      throw new HttpError(409, 'Email nay da duoc dang ky. Vui long dang nhap.')
    }

    await issueEmailVerification(trimmedEmail, 'signup', {
      name: trimmedName,
      passwordHash: await hashPassword(password),
    })
    res.status(202).json({ message: 'Ma xac minh da duoc gui den email cua ban.' })
  }),
)

router.post(
  '/signup/verify',
  authEmailCodeLimiter,
  asyncHandler(async (req, res) => {
    const { email, code } = req.body ?? {}
    const trimmedEmail = (email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(trimmedEmail)) throw new HttpError(400, 'Email khong hop le.')

    const verification = await verifyEmailCode(trimmedEmail, 'signup', code)
    if (!verification.pendingName || !verification.pendingPasswordHash) {
      throw new HttpError(400, 'Yeu cau dang ky khong hop le. Vui long dang ky lai.')
    }
    if (await findUserByEmail(trimmedEmail)) {
      throw new HttpError(409, 'Email nay da duoc dang ky. Vui long dang nhap.')
    }

    const user = await createUser({
      name: verification.pendingName,
      email: trimmedEmail,
      passwordHash: verification.pendingPasswordHash,
      provider: 'form',
      planId: DEFAULT_PLAN_ID,
    })
    await sendAuthenticated(res, req, user, 201)
  }),
)

router.post(
  '/password-reset/request',
  authEmailCodeLimiter,
  asyncHandler(async (req, res) => {
    const trimmedEmail = (req.body?.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(trimmedEmail)) throw new HttpError(400, 'Email khong hop le.')

    const user = await findUserByEmail(trimmedEmail)
    if (user?.provider === 'google') {
      throw new HttpError(409, 'Tai khoan nay dung Google de dang nhap. Vui long chon "Tiep tuc voi Google".')
    }
    if (user?.provider === 'form') {
      await issueEmailVerification(trimmedEmail, 'password_reset')
    }
    res.status(202).json({ message: 'Neu email ton tai, ma dat lai mat khau da duoc gui.' })
  }),
)

router.post(
  '/password-reset/confirm',
  authEmailCodeLimiter,
  asyncHandler(async (req, res) => {
    const { email, code, password } = req.body ?? {}
    const trimmedEmail = (email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(trimmedEmail)) throw new HttpError(400, 'Email khong hop le.')
    if (!password || password.length < 6) {
      throw new HttpError(400, 'Mat khau can toi thieu 6 ky tu.')
    }

    const user = await findUserByEmail(trimmedEmail)
    if (!user || user.provider !== 'form') {
      throw new HttpError(400, 'Khong the dat lai mat khau cho tai khoan nay.')
    }
    await verifyEmailCode(trimmedEmail, 'password_reset', code)
    await updateUser(user.id, { passwordHash: await hashPassword(password) })
    // The old password may have been compromised — sign every device out.
    await revokeAllUserSessions(user.id)
    res.json({ message: 'Mat khau da duoc dat lai. Vui long dang nhap.' })
  }),
)

router.post(
  '/signin',
  authSigninLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {}
    const trimmedEmail = (email ?? '').trim().toLowerCase()

    const user = await findUserByEmail(trimmedEmail)
    if (!user) {
      throw new HttpError(401, 'Email hoặc mật khẩu không chính xác.')
    }
    if (user.provider !== 'form') {
      throw new HttpError(400, 'Tài khoản này được đăng ký qua Google. Vui lòng nhấn nút "Tiếp tục với Google".')
    }

    const passwordMatches = await verifyPassword(password ?? '', user.passwordHash)
    if (!passwordMatches) throw new HttpError(401, 'Email hoặc mật khẩu không chính xác.')

    await sendAuthenticated(res, req, user)
  }),
)

router.post(
  '/google',
  authGoogleLimiter,
  asyncHandler(async (req, res) => {
    // Never trust client-supplied identity fields. In particular, accepting
    // an arbitrary email here would allow impersonation of the admin user.
    if (!env.googleClientId) {
      throw new HttpError(503, 'Đăng nhập Google hiện chưa được cấu hình. Vui lòng dùng email và mật khẩu.')
    }

    const { credential } = req.body ?? {}
    const payload = await verifyGoogleCredential(credential)
    const verifiedEmail = payload.email
    const verifiedName = payload.name
    const verifiedPicture = payload.picture

    const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(verifiedName || verifiedEmail.split('@')[0])}&background=1a73e8&color=ffffff&bold=true`
    const finalPicture = verifiedPicture || defaultAvatarUrl

    let user = await findUserByEmail(verifiedEmail)
    if (user && user.provider !== 'google') {
      throw new HttpError(400, 'Email này đã đăng ký bằng mật khẩu. Hãy đăng nhập bằng biểu mẫu.')
    }
    if (!user) {
      user = await createUser({
        name: (verifiedName || verifiedEmail.split('@')[0]).trim(),
        email: verifiedEmail,
        passwordHash: null,
        provider: 'google',
        planId: DEFAULT_PLAN_ID,
        picture: finalPicture,
      })
    } else {
      if (!user.picture || (verifiedPicture && user.picture !== verifiedPicture)) {
        user = await updateUser(user.id, { picture: finalPicture })
      }
    }

    await sendAuthenticated(res, req, user)
  }),
)

router.post('/signout', authGeneralLimiter, asyncHandler(async (req, res) => {
  // Revoke the current session if a token is present
  const token = req.cookies?.[AUTH_COOKIE_NAME]
  if (token) {
    try {
      const payload = verifySessionToken(token)
      if (payload?.jti) {
        await revokeSession(payload.jti)
      }
    } catch {}
  }
  res.clearCookie(AUTH_COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: undefined })
  res.status(204).end()
}))

router.post(
  '/mobile/refresh',
  authGeneralLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {}
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new HttpError(400, 'A refresh token is required.')
    }
    const tokens = await rotateMobileRefreshToken(refreshToken)
    if (!tokens) throw new HttpError(401, 'Invalid or expired refresh token.')
    res.json({ tokens })
  }),
)

router.post(
  '/mobile/signout',
  requireAuth,
  authGeneralLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {}
    if (typeof refreshToken === 'string' && refreshToken) {
      await revokeMobileRefreshToken(req.userId, refreshToken)
    }
    res.status(204).end()
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    await syncUserProStatus(req.userId)
    const user = await findUserById(req.userId)
    if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản.')
    res.json({ user: toPublicUser(user) })
  }),
)

export default router
