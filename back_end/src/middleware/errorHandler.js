export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Không tìm thấy route ${req.method} ${req.path}` })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500
  const isServerError = status >= 500

  // Log the original error first — the public response must stay generic for
  // 5xx, but server logs need the real diagnostic message.
  if (isServerError) {
    console.error(err)
  } else {
    console.warn(`[Client Error ${status}] ${err.message} - Path: ${req.method} ${req.path}`)
  }

  // Errors are only accumulated in-memory for non-production environments.
  // Production: no in-memory error log to prevent memory leaks.
  if (!isProd()) {
    global.serverErrors = global.serverErrors || []
    global.serverErrors.push({
      timestamp: new Date().toISOString(),
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    })
    if (global.serverErrors.length > 50) global.serverErrors.shift()
  }

  const publicMessage = isServerError
    ? 'An unexpected server error occurred.'
    : err.message
  res.status(status).json({ error: publicMessage || 'Đã xảy ra lỗi máy chủ.' })
}

function isProd() {
  return process.env.NODE_ENV === 'production'
}
