import { Component } from 'react'
import './ErrorBoundary.css'

/**
 * Top-level safety net: keeps a render crash from white-screening the whole
 * SPA and gives the user a way to recover without reading a console.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Render error:', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary__card">
          <h1>Đã xảy ra lỗi hệ thống</h1>
          <p>
            Ứng dụng gặp sự cố không mong muốn. Vui lòng tải lại trang — nếu vấn đề
            tiếp diễn, hãy quay lại sau ít phút.
          </p>
          {this.state.error?.message && (
            <pre className="error-boundary__detail">{String(this.state.error.message)}</pre>
          )}
          <button type="button" className="error-boundary__reload" onClick={this.handleReload}>
            Tải lại trang
          </button>
        </div>
      </div>
    )
  }
}
