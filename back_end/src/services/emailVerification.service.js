import crypto from 'node:crypto'
import nodemailer from 'nodemailer'
import { EmailVerificationModel } from '../db/email_verification.model.js'
import { env } from '../config/env.js'
import { HttpError } from '../utils/httpError.js'

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function createCode() {
  return crypto.randomInt(100000, 1000000).toString()
}

function getEmailCopy(purpose, code) {
  const subject = purpose === 'signup'
    ? 'MedChat247 - Xac minh dia chi email'
    : 'MedChat247 - Dat lai mat khau'
  const action = purpose === 'signup' ? 'xac minh email dang ky' : 'dat lai mat khau'

  return {
    subject,
    text: `Ma xac minh MedChat247 cua ban la: ${code}\n\nMa nay dung de ${action} va het han sau 10 phut. Khong chia se ma nay voi bat ky ai.`,
  }
}

async function sendEmail({ to, subject, text }) {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.smtpFrom) {
    if (!env.isProd) {
      console.log(`[Email verification][dev] Recipient: ${to}; ${text}`)
      return
    }
    throw new HttpError(503, 'Dich vu gui email chua duoc cau hinh.')
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  })

  await transporter.sendMail({ from: env.smtpFrom, to, subject, text })
}

export async function issueEmailVerification(email, purpose, pending = {}) {
  const normalizedEmail = normalizeEmail(email)
  const code = createCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await EmailVerificationModel.findOneAndUpdate(
    { email: normalizedEmail, purpose },
    {
      $set: {
        codeHash: hashCode(code),
        pendingName: pending.name ?? null,
        pendingPasswordHash: pending.passwordHash ?? null,
        attempts: 0,
        expiresAt,
      },
    },
    { upsert: true, new: true },
  )

  const copy = getEmailCopy(purpose, code)
  await sendEmail({ to: normalizedEmail, ...copy })
}

export async function verifyEmailCode(email, purpose, code) {
  const normalizedEmail = normalizeEmail(email)
  const verification = await EmailVerificationModel.findOne({ email: normalizedEmail, purpose })

  if (!verification || verification.expiresAt <= new Date()) {
    throw new HttpError(400, 'Ma xac minh da het han. Vui long gui lai ma moi.')
  }
  if (verification.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(429, 'Ban da nhap sai qua nhieu lan. Vui long gui lai ma moi.')
  }

  if (!crypto.timingSafeEqual(Buffer.from(verification.codeHash), Buffer.from(hashCode(String(code ?? ''))))) {
    await EmailVerificationModel.updateOne(
      { _id: verification._id },
      { $inc: { attempts: 1 } },
    )
    throw new HttpError(400, 'Ma xac minh khong dung.')
  }

  await EmailVerificationModel.deleteOne({ _id: verification._id })
  return verification.toObject()
}
