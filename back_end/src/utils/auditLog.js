import { env } from '../config/env.js'

/**
 * Centralized audit logging utility to control logging of sensitive data
 * (such as patient symptoms) and operational logs across services.
 * 
 * Configurable via ENABLE_AUDIT_LOGS in environment or env configuration.
 */
export function auditLog(category, action, data = null, level = 'info') {
  const enabled = process.env.ENABLE_AUDIT_LOGS !== 'false' && env.enableAuditLogs !== false
  if (!enabled && level !== 'error') return

  const timestamp = new Date().toISOString()
  const tag = `[Audit Log][${category}][${action}]`

  if (level === 'error') {
    console.error(`${tag} ${timestamp}:`, data)
  } else if (level === 'warn') {
    console.warn(`${tag} ${timestamp}:`, data)
  } else {
    if (data !== null && data !== undefined) {
      console.log(`${tag}:`, data)
    } else {
      console.log(`${tag}`)
    }
  }
}
