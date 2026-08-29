import { describe, it, expect } from 'vitest'
import { HttpError } from './httpError.js'

describe('HttpError', () => {
  it('creates error with correct status and message', () => {
    const err = new HttpError(400, 'Bad request')
    expect(err.status).toBe(400)
    expect(err.message).toBe('Bad request')
    expect(err instanceof Error).toBe(true)
  })

  it('defaults to 500 status', () => {
    const err = new HttpError('Oops')
    expect(err.status).toBe(500)
    expect(err.message).toBe('Oops')
  })

  it('has non-enumerable status property', () => {
    const err = new HttpError(418, 'Teapot')
    const keys = Object.keys(err)
    expect(keys).not.toContain('status')
    expect(err.status).toBe(418)
  })
})
