import { useEffect, useState } from 'react'

// Tab "Mức sử dụng": tự tải số liệu token từ server khi được mở.
export default function UsageTab({ plan, isEn, onFetchUsage }) {
  const [usage, setUsage] = useState(null)
  const [usageError, setUsageError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await onFetchUsage()
        if (!cancelled) setUsage(data)
      } catch (err) {
        if (!cancelled) setUsageError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [onFetchUsage])

  const usagePercent = usage
    ? Math.min(100, Math.round((usage.tokensUsed / usage.tokenLimit) * 100))
    : 0

  return (
    <section>
      <h2>{isEn ? 'Usage & Token Limit' : 'Mức sử dụng & Token'}</h2>
      <p className="settings-modal__hint">
        {isEn
          ? 'Recorded token usage per conversation (~4 chars/token). Accumulated towards your monthly limit.'
          : 'Số liệu do máy chủ backend ghi nhận sau mỗi lần bạn nhắn tin (ước tính ~4 ký tự/token).'
        }
      </p>
      {usageError && <p className="auth-modal__error">{usageError}</p>}
      {!usage && !usageError && <p className="settings-modal__hint">{isEn ? 'Loading...' : 'Đang tải...'}</p>}
      {usage && (
        <div className="usage-card">
          <div className="usage-card__row">
            <span>{isEn ? 'Current Plan' : 'Gói hiện tại'}</span>
            <strong>{plan.name}</strong>
          </div>
          <div className="usage-card__row">
            <span>{isEn ? 'Tokens Used' : 'Đã dùng'}</span>
            <strong>
              {usage.tokensUsed.toLocaleString(isEn ? 'en-US' : 'vi-VN')} /{' '}
              {usage.tokenLimit.toLocaleString(isEn ? 'en-US' : 'vi-VN')} tokens
            </strong>
          </div>
          <div className="usage-bar">
            <div className="usage-bar__fill" style={{ width: `${usagePercent}%` }} />
          </div>
          <p className="usage-card__note">{usagePercent}% {isEn ? 'limit used.' : 'hạn mức đã sử dụng.'}</p>
        </div>
      )}
    </section>
  )
}
