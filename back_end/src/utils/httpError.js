export class HttpError extends Error {
  constructor(status, message) {
    if (typeof status === 'string') {
      super(status)
    } else {
      super(message)
    }
    Object.defineProperty(this, 'status', {
      value: typeof status === 'string' ? 500 : status,
      enumerable: false,
      writable: true,
      configurable: true,
    })
  }
}
