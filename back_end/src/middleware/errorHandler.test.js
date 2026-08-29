import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { notFoundHandler, errorHandler } from './errorHandler.js'
import { HttpError } from '../utils/httpError.js'

describe('notFoundHandler', () => {
  it('returns 404 with method and path', () => {
    const req = { method: 'DELETE', path: '/api/ghost' }
    const res = makeMockRes()
    notFoundHandler(req, res)
    expect(res._status).toBe(404)
    expect(res._body.error).toContain('DELETE')
    expect(res._body.error).toContain('/api/ghost')
  })
})

describe('errorHandler', () => {
  let consoleErrorSpy, consoleWarnSpy

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockReturnValue()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockReturnValue()
    delete global.serverErrors
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('returns 500 for generic error', () => {
    const err = new Error('DB down')
    const res = makeMockRes()
    errorHandler(err, {}, res)
    expect(res._status).toBe(500)
    expect(res._body.error).toBe('An unexpected server error occurred.')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('returns the HttpError status code', () => {
    const err = new HttpError(403, 'Forbidden')
    const res = makeMockRes()
    errorHandler(err, {}, res)
    expect(res._status).toBe(403)
    expect(res._body.error).toBe('Forbidden')
    expect(consoleWarnSpy).toHaveBeenCalled()
  })

  it('returns 400 for validation errors', () => {
    const err = new HttpError(400, 'Email không hợp lệ.')
    const res = makeMockRes()
    errorHandler(err, { method: 'POST', path: '/api/auth/signup' }, res)
    expect(res._status).toBe(400)
    expect(consoleWarnSpy).toHaveBeenCalled()
  })

  it('does not accumulate errors in production', () => {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const err = new Error('test')
    const res = makeMockRes()
    errorHandler(err, {}, res)
    process.env.NODE_ENV = prevEnv
    expect(global.serverErrors).toBeUndefined()
  })

  it('does not return stack trace to client', () => {
    const err = new Error('secret internal message')
    const res = makeMockRes()
    errorHandler(err, {}, res)
    expect(res._body.error).not.toContain('stack')
    expect(res._body.error).toBe('An unexpected server error occurred.')
  })
})

function makeMockRes() {
  const r = { _status: null, _body: null }
  r.status = (s) => { r._status = s; return r }
  r.json = (b) => { r._body = b; return r }
  return r
}
