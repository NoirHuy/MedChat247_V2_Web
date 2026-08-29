#!/usr/bin/env node
// Post-deployment API smoke test.
//
// Usage:
//   BASE_URL=https://your-domain.com node scripts/smoke.mjs
//   (BASE_URL defaults to http://127.0.0.1:4000)
//
// Exits non-zero on the first failed check. Safe to run against production:
// it only calls public endpoints and never mutates data.

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')

let failures = 0

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  console.log(`Smoke testing ${BASE_URL} ...\n`)

  // 1. Health endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/monitoring/health`)
    const body = await res.json().catch(() => ({}))
    check('GET /api/monitoring/health → 200', res.status === 200, `status=${res.status}`)
    check('Health reports status ok', body.status === 'ok', `status=${body.status}`)
  } catch (err) {
    check('GET /api/monitoring/health → 200', false, err.message)
  }

  // 2. Plans catalog (public)
  try {
    const res = await fetch(`${BASE_URL}/api/account/plans`)
    const body = await res.json().catch(() => ({}))
    check('GET /api/account/plans → 200 with plans[]', res.status === 200 && Array.isArray(body.plans) && body.plans.length > 0, `status=${res.status}`)
  } catch (err) {
    check('GET /api/account/plans → 200 with plans[]', false, err.message)
  }

  // 3. Chat validation: empty messages must be rejected with 400
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    check('POST /api/chat (empty messages) → 400', res.status === 400, `status=${res.status}`)
  } catch (err) {
    check('POST /api/chat (empty messages) → 400', false, err.message)
  }

  // 4. Admin surface must not be public
  try {
    const res = await fetch(`${BASE_URL}/api/admin/stats/overview`)
    check('GET /api/admin/stats/overview without auth → 401', res.status === 401, `status=${res.status}`)
  } catch (err) {
    check('GET /api/admin/stats/overview without auth → 401', false, err.message)
  }

  // 5. Monitoring metrics must not be public either
  try {
    const res = await fetch(`${BASE_URL}/api/monitoring/metrics`)
    check('GET /api/monitoring/metrics without auth → 401', res.status === 401, `status=${res.status}`)
  } catch (err) {
    check('GET /api/monitoring/metrics without auth → 401', false, err.message)
  }

  // 6. SPA root served as HTML
  try {
    const res = await fetch(`${BASE_URL}/`)
    const contentType = res.headers.get('content-type') || ''
    check('GET / → 200 text/html', res.status === 200 && contentType.includes('text/html'), `status=${res.status} type=${contentType}`)
  } catch (err) {
    check('GET / → 200 text/html', false, err.message)
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
