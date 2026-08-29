import crypto from 'node:crypto'
import { env } from '../config/env.js'

// Derive a 32-byte (256-bit) AES key from MEMORY_ENCRYPTION_KEY using SHA-256.
// env.memoryEncryptionKey is guaranteed non-placeholder (throws otherwise).
function getMasterKey() {
  return crypto.createHash('sha256').update(env.memoryEncryptionKey).digest()
}

function isEncryptedFormat(value) {
  return typeof value === 'string' && value.split(':').length === 3
}

/**
 * Encrypts a text string using AES-256-GCM with a 96-bit IV and 128-bit Auth Tag.
 * Output format: "ivHex:authTagHex:encryptedHex".
 *
 * Fails CLOSED: on any error it throws instead of silently returning the
 * plaintext — sensitive medical data must never be stored unencrypted by
 * accident. Callers decide whether to surface or skip the failure.
 * @param {string} text
 * @returns {string}
 */
export function encryptText(text) {
  if (!text || typeof text !== 'string') return text
  const iv = crypto.randomBytes(12) // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypts an encrypted text formatted as "ivHex:authTagHex:encryptedHex".
 * Unencrypted legacy/plaintext values pass through unchanged.
 *
 * Returns NULL when ciphertext exists but cannot be authenticated (wrong key,
 * rotated secret, corrupted record). Returning the raw ciphertext would leak
 * it into prompts/UI, so callers must skip null entries.
 * @param {string} encryptedData
 * @returns {string|null}
 */
export function decryptText(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') return encryptedData
  if (!isEncryptedFormat(encryptedData)) {
    // Plaintext or legacy format
    return encryptedData
  }

  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err) {
    console.error('[MemoryCrypto] Decryption failed (wrong key or corrupted record):', err.message)
    return null
  }
}
