import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from './config/env.js'
import { connectDatabase, closeDatabase } from './db/mongodb.js'
import { connectRedis, disconnectRedis } from './config/redis.js'
import authRoutes from './routes/auth.routes.js'
import accountRoutes from './routes/account.routes.js'
import chatRoutes from './routes/chat.routes.js'
import paymentRoutes from './routes/payment.routes.js'
import adminRoutes from './routes/admin.routes.js'
import memoriesRoutes from './routes/memories.routes.js'
import feedbackRoutes from './routes/feedback.routes.js'
import monitoringRoutes from './routes/monitoring.routes.js'
import { startBillingScheduler } from './services/billingScheduler.js'
import { getSession, getAllSymptoms } from './services/graphrag/neo4jClient.js'
import { initSymptomVectorIndex } from './services/graphrag/symptomVectorIndex.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Connect to MongoDB
connectDatabase()
// Connect to Redis (non-blocking; falls back to in-memory cache if unavailable)
connectRedis().catch((err) => {
  console.warn(`[startup] Redis initialization error: ${err.message}`)
})

// ─── Graceful shutdown: stop accepting connections, then close Redis + Mongo ──
let httpServer = null
let isShuttingDown = false

async function shutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`[shutdown] ${signal} received — closing server...`)
  const forceExitTimer = setTimeout(() => {
    console.error('[shutdown] Timed out waiting for connections to close; forcing exit.')
    process.exit(1)
  }, 10000)
  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve))
    }
    await disconnectRedis()
    await closeDatabase()
    clearTimeout(forceExitTimer)
    console.log('[shutdown] Clean exit.')
    process.exit(0)
  } catch (err) {
    console.error('[shutdown] Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception:', err)
  shutdown('uncaughtException').catch(() => process.exit(1))
})

const app = express()

// 🛡️ CHỐNG GIẢ MẠO HEADER (IP SPOOFING): Chỉ tin tưởng X-Forwarded-For nếu request thực sự đến từ Nginx/Loopback nội bộ.
// Nếu hacker gọi trực tiếp vào Port máy chủ từ Internet, Express sẽ bỏ qua header giả mạo và lấy IP TCP thật của hacker!
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])

app.use(cors({ origin: env.clientOrigin, credentials: true }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // Allow-list everything the SPA actually loads: Google Identity Services
  // (sign-in script + iframe) and PayPal SDK (script, frames, popups).
  // style-src 'unsafe-inline' covers React inline style attributes.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com https://www.paypal.com https://www.sandbox.paypal.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://ui-avatars.com https://lh3.googleusercontent.com",
    'font-src \'self\' data:',
    "connect-src 'self' https://accounts.google.com",
    'frame-src https://accounts.google.com https://www.paypal.com https://www.sandbox.paypal.com',
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '))
  next()
})

// PayPal verifies the original byte stream. Its route owns body parsing with
// express.raw(), so the JSON parser must not consume it first.
app.use(express.json({
  limit: '200kb',
  type: (req) => !req.originalUrl.startsWith('/api/payments/paypal/webhook'),
}))
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/account', accountRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/memories', memoriesRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/monitoring', monitoringRoutes)

// Phục vụ tệp tĩnh Frontend trong môi trường Production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../../dist')
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.use(notFoundHandler)
app.use(errorHandler)

const WARMUP_RETRY_DELAYS_MS = [0, 1000, 2000, 4000, 8000, 15000]

async function warmSymptomVectorIndex() {
  let lastError = null
  for (const delayMs of WARMUP_RETRY_DELAYS_MS) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const session = getSession()
    try {
      const symptoms = await getAllSymptoms(session)
      await initSymptomVectorIndex(symptoms)
      console.log('[startup] Symptom vector index warm-up completed.')
      return
    } catch (err) {
      lastError = err
      console.warn(`[startup] Symptom vector index warm-up attempt failed; retrying: ${err.message}`)
    } finally {
      await session.close()
    }
  }
  console.error('[startup] Symptom vector index warm-up failed after retries:', lastError?.message)
}

httpServer = app.listen(env.port, '0.0.0.0', () => {
  console.log(`MedChat247 backend listening on http://0.0.0.0:${env.port}`)
  startBillingScheduler()

  // Build embeddings before the first consultation so cold-start work cannot
  // delay a patient's first streamed response.
  void warmSymptomVectorIndex()
  if (process.env.NODE_ENV === 'production') {
    console.log('[startup] Production mode — all secrets must be real values.')
  } else if (!env.ninerouterApi) {
    console.log('[startup] WARNING: NINEROUTER_API not set — chat will return demo replies.')
  }
})
