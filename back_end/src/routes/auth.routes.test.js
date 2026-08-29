import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../config/env.js', () => ({
  env: {
    googleClientId: null,
    jwtSecret: 'test-secret',
    cookieSecure: false,
  },
}))

vi.mock('../db/usersRepo.js', () => ({
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  updateUser: vi.fn(),
  toPublicUser: (u) => u,
}))

vi.mock('../services/googleAuthService.js', () => ({
  verifyGoogleCredential: vi.fn(),
}))

vi.mock('../services/emailVerification.service.js', () => ({
  issueEmailVerification: vi.fn(),
  verifyEmailCode: vi.fn(),
}))

vi.mock('../services/mobileToken.service.js', () => ({
  issueMobileTokens: vi.fn(),
  revokeMobileRefreshToken: vi.fn(),
  rotateMobileRefreshToken: vi.fn(),
}))

vi.mock('../utils/jwt.js', () => ({
  AUTH_COOKIE_NAME: 'medchat_token',
  signSessionToken: vi.fn(() => ({ token: 'signed.jwt.value', jti: 'mock-jti' })),
}))

vi.mock('../services/auth/authCache.js', () => ({
  storeSession: vi.fn(async () => true),
  revokeSession: vi.fn(async () => true),
  isSessionRevoked: vi.fn(async () => false),
}))

const { default: authRouter } = await import('./auth.routes.js')
const express = (await import('express')).default
const supertest = (await import('supertest')).default

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  // Minimal error handler mirroring production middleware shape.
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message })
  })
  return app
}

describe('POST /api/auth/signup and password reset', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends an email verification request instead of creating an account immediately', async () => {
    const { findUserByEmail, createUser } = await import('../db/usersRepo.js')
    const { issueEmailVerification } = await import('../services/emailVerification.service.js')
    findUserByEmail.mockResolvedValue(null)

    const res = await supertest(buildApp())
      .post('/api/auth/signup')
      .send({ name: 'Test User', email: 'test@example.com', password: 'password123' })

    expect(res.status).toBe(202)
    expect(issueEmailVerification).toHaveBeenCalledWith(
      'test@example.com',
      'signup',
      expect.objectContaining({ name: 'Test User', passwordHash: expect.any(String) }),
    )
    expect(createUser).not.toHaveBeenCalled()
  })

  it('creates an account only after a valid signup code is confirmed', async () => {
    const { findUserByEmail, createUser } = await import('../db/usersRepo.js')
    const { verifyEmailCode } = await import('../services/emailVerification.service.js')
    findUserByEmail.mockResolvedValue(null)
    verifyEmailCode.mockResolvedValue({ pendingName: 'Test User', pendingPasswordHash: 'hashed-password' })
    createUser.mockResolvedValue({ id: 'u1', email: 'test@example.com' })

    const res = await supertest(buildApp())
      .post('/api/auth/signup/verify')
      .send({ email: 'test@example.com', code: '123456' })

    expect(res.status).toBe(201)
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test User', passwordHash: 'hashed-password', provider: 'form',
    }))
  })

  it('does not disclose whether a password-reset email belongs to an account', async () => {
    const { findUserByEmail } = await import('../db/usersRepo.js')
    const { issueEmailVerification } = await import('../services/emailVerification.service.js')
    findUserByEmail.mockResolvedValue(null)

    const res = await supertest(buildApp())
      .post('/api/auth/password-reset/request')
      .send({ email: 'unknown@example.com' })

    expect(res.status).toBe(202)
    expect(issueEmailVerification).not.toHaveBeenCalled()
  })

  it('tells Google users to use Google sign-in instead of requesting an OTP', async () => {
    const { findUserByEmail } = await import('../db/usersRepo.js')
    const { issueEmailVerification } = await import('../services/emailVerification.service.js')
    findUserByEmail.mockResolvedValue({ id: 'google-user', provider: 'google' })

    const res = await supertest(buildApp())
      .post('/api/auth/password-reset/request')
      .send({ email: 'google-user@gmail.com' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Google/i)
    expect(issueEmailVerification).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/google', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unverified credential flow when GOOGLE_CLIENT_ID is not configured', async () => {
    const app = buildApp()
    const res = await supertest(app)
      .post('/api/auth/google')
      .send({ email: 'admin@medchat247.ai', name: 'Attacker' })

    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/chưa được cấu hình/i)
  })

  it('does not call the unverified credential branch even when credential is provided', async () => {
    const { verifyGoogleCredential } = await import('../services/googleAuthService.js')
    const { findUserByEmail, createUser } = await import('../db/usersRepo.js')

    const app = buildApp()
    const res = await supertest(app)
      .post('/api/auth/google')
      .send({ credential: 'fake.token', email: 'admin@medchat247.ai' })

    expect(res.status).toBe(503)
    expect(verifyGoogleCredential).not.toHaveBeenCalled()
    expect(findUserByEmail).not.toHaveBeenCalled()
    expect(createUser).not.toHaveBeenCalled()
  })
})
