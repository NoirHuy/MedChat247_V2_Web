import { useEffect, useState } from 'react'
import { ShieldCheckIcon, FileTextIcon } from '../Icons'
import { apiRequest } from '../../services/api'

const PRIORITY_LABELS = {
  urgent: { en: 'Urgent', vi: 'Khẩn cấp' },
  high: { en: 'High', vi: 'Cao' },
  medium: { en: 'Medium', vi: 'TB' },
  low: { en: 'Low', vi: 'Thấp' },
}

const CATEGORY_LABELS = {
  help: { en: 'Help', vi: 'Trợ giúp' },
  bug: { en: 'Bug', vi: 'Báo lỗi' },
  feature: { en: 'Feature', vi: 'Tính năng' },
  question: { en: 'Question', vi: 'Câu hỏi' },
  complaint: { en: 'Complaint', vi: 'Khiếu nại' },
  other: { en: 'Other', vi: 'Khác' },
}

const STATUS_LABELS = {
  new: { en: 'New', vi: 'Mới' },
  read: { en: 'Read', vi: 'Đã đọc' },
  in_progress: { en: 'In Progress', vi: 'Đang xử lý' },
  resolved: { en: 'Resolved', vi: 'Đã giải quyết' },
  closed: { en: 'Closed', vi: 'Đã đóng' },
}

// Tab "Trợ giúp": văn bản pháp lý, gửi phản hồi và xem lịch sử phản hồi.
export default function HelpTab({ isEn, isLoggedIn, showToast }) {
  const [feedbackContent, setFeedbackContent] = useState('')
  const [feedbackCategory, setFeedbackCategory] = useState('help')
  const [feedbackPriority, setFeedbackPriority] = useState('medium')
  // Anonymous flag is meaningless when a reply is requested — keep both in sync.
  const [feedbackAnonymous, setFeedbackAnonymous] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [myFeedbacks, setMyFeedbacks] = useState([])
  const [myFeedbacksLoading, setMyFeedbacksLoading] = useState(false)
  const [showFeedbackHistory, setShowFeedbackHistory] = useState(false)

  async function loadMyFeedbacks() {
    setMyFeedbacksLoading(true)
    try {
      const data = await apiRequest('/api/feedback/me')
      setMyFeedbacks(data.feedbacks || [])
    } catch (err) {
      console.error('[Feedback] Load history error:', err)
    } finally {
      setMyFeedbacksLoading(false)
    }
  }

  useEffect(() => {
    if (isLoggedIn) loadMyFeedbacks()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [isLoggedIn])

  function handleCategoryChange(value) {
    setFeedbackCategory(value)
    if (value === 'help') setFeedbackAnonymous(false)
  }

  async function handleSubmitFeedback(e) {
    e.preventDefault()
    if (!feedbackContent.trim()) return

    setFeedbackSubmitting(true)
    try {
      await apiRequest('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          content: feedbackContent.trim(),
          category: feedbackCategory,
          priority: feedbackPriority,
          isAnonymous: feedbackAnonymous,
        }),
      })
      showToast?.(isEn ? 'Feedback submitted successfully! Thank you.' : 'Gửi phản hồi thành công! Cảm ơn bạn đã đóng góp ý kiến.')
      setFeedbackContent('')
      setFeedbackAnonymous(false)
      setFeedbackPriority('medium')
      setShowFeedbackHistory(true)
      loadMyFeedbacks()
    } catch (err) {
      showToast?.(err.message || (isEn ? 'Could not submit feedback.' : 'Không thể gửi phản hồi.'))
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  return (
    <section className="help-section">
      <h2>{isEn ? 'Help, Support & Legal' : 'Trợ giúp & Phản hồi'}</h2>
      <p className="settings-modal__hint">
        {isEn
          ? 'Have questions, need support, or wish to review legal documents? Reach out to the MedChat247 development team below.'
          : 'Gặp khó khăn khi sử dụng hoặc muốn đóng góp ý kiến nâng cấp hệ thống? Bạn có thể gửi phản hồi trực tiếp cho đội ngũ phát triển MedChat247 tại đây.'
        }
      </p>

      {/* VĂN BẢN PHÁP LÝ & QUYỀN RIÊNG TƯ */}
      <div className="settings-section-box">
        <h3 className="settings-subheading">
          <ShieldCheckIcon /> {isEn ? 'Legal & Privacy Documentation' : 'Văn bản Pháp lý & Quyền riêng tư'}
        </h3>
        <p className="settings-modal__hint" style={{ marginBottom: '14px' }}>
          {isEn
            ? 'Read our official terms of service and medical data confidentiality commitments.'
            : 'Xem các văn bản pháp lý chính thức và cam kết bảo vệ dữ liệu y tế của MedChat247.'
          }
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noreferrer"
            className="btn btn--outline btn--sm"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ShieldCheckIcon /> {isEn ? 'Privacy Policy' : 'Chính sách bảo mật'}
          </a>
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="btn btn--outline btn--sm"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FileTextIcon /> {isEn ? 'Terms of Service' : 'Điều khoản sử dụng'}
          </a>
        </div>
      </div>

      <div className="settings-divider" />

      {/* Toggle: Gửi mới / Lịch sử */}
      <div className="help-tabs-toggle">
        <button
          className={`help-tab-btn ${!showFeedbackHistory ? 'active' : ''}`}
          onClick={() => setShowFeedbackHistory(false)}
        >
          {isEn ? 'Submit New Feedback' : 'Gửi phản hồi mới'}
        </button>
        {isLoggedIn && (
          <button
            className={`help-tab-btn ${showFeedbackHistory ? 'active' : ''}`}
            onClick={() => { setShowFeedbackHistory(true); loadMyFeedbacks(); }}
          >
            {isEn ? `Feedback History (${myFeedbacks.length})` : `Lịch sử phản hồi (${myFeedbacks.length})`}
          </button>
        )}
      </div>

      {!showFeedbackHistory ? (
        <>
          {/* Form gửi phản hồi */}
          <form onSubmit={handleSubmitFeedback} style={{ marginTop: '16px' }}>
            <label className="settings-field">
              <span>{isEn ? 'Feedback Type' : 'Loại phản hồi'}</span>
              <select
                value={feedbackCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-hover)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                }}
              >
                <option value="help">{isEn ? 'Help (Request reply)' : 'Trợ giúp (cần phản hồi)'}</option>
                <option value="bug">{isEn ? 'Bug Report' : 'Báo lỗi (Bug)'}</option>
                <option value="feature">{isEn ? 'Feature Request' : 'Yêu cầu tính năng mới'}</option>
                <option value="question">{isEn ? 'Question' : 'Câu hỏi'}</option>
                <option value="complaint">{isEn ? 'Complaint' : 'Khiếu nại'}</option>
                <option value="other">{isEn ? 'Other' : 'Khác'}</option>
              </select>
            </label>

            <label className="settings-field">
              <span>{isEn ? 'Priority Level' : 'Mức độ ưu tiên'}</span>
              <select
                value={feedbackPriority}
                onChange={(e) => setFeedbackPriority(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-hover)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                }}
              >
                <option value="low">{isEn ? 'Low' : 'Thấp'}</option>
                <option value="medium">{isEn ? 'Medium' : 'Trung bình'}</option>
                <option value="high">{isEn ? 'High' : 'Cao'}</option>
                <option value="urgent">{isEn ? 'Urgent' : 'Khẩn cấp'}</option>
              </select>
            </label>

            <label className="settings-field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span>{isEn ? 'Feedback Content' : 'Nội dung phản hồi'}</span>
              <textarea
                name="feedback"
                placeholder={isEn ? 'Describe your question or issue in detail...' : 'Mô tả chi tiết câu hỏi hoặc vấn đề bạn gặp phải...'}
                rows={5}
                required
                value={feedbackContent}
                onChange={(e) => setFeedbackContent(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-hover)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  resize: 'vertical',
                  minHeight: '100px',
                }}
              />
            </label>

            {/* Toggle gửi ẩn danh */}
            <div className="auto-renew-row" style={{ marginTop: '4px' }}>
              <div className="auto-renew-text">
                <strong>{isEn ? 'Submit Anonymously' : 'Gửi ẩn danh'}</strong>
                <p className="auto-renew-hint">
                  {feedbackAnonymous
                    ? (isEn ? 'Your name and email will be hidden.' : 'Tên và email của bạn sẽ bị ẩn với admin.')
                    : (isEn ? 'Admin will see your account name and email.' : 'Admin sẽ thấy tên và email tài khoản của bạn.')
                  }
                </p>
              </div>
              <label className={`toggle-switch ${feedbackCategory === 'help' ? 'toggle-switch--disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={feedbackAnonymous}
                  onChange={(e) => setFeedbackAnonymous(e.target.checked)}
                  disabled={feedbackCategory === 'help'}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="submit" className="btn btn--primary" disabled={feedbackSubmitting || !feedbackContent.trim()}>
                {feedbackSubmitting ? (isEn ? 'Submitting...' : 'Đang gửi...') : (isEn ? 'Submit Feedback' : 'Gửi phản hồi')}
              </button>
            </div>
          </form>

          <div className="faq-box" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>{isEn ? 'Frequently Asked Questions (FAQ)' : 'Câu hỏi thường gặp (FAQ)'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {isEn ? '1. Is MedChat247 medical diagnosis accurate?' : '1. MedChat247 chẩn đoán có chính xác không?'}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  {isEn
                    ? 'The system provides preliminary reference and symptom screening based on clinical knowledge graphs. Results do not replace professional physician diagnosis.'
                    : 'Hệ thống chỉ mang tính chất sàng lọc và tư vấn ban đầu dựa trên đồ thị tri thức lâm sàng SymCAT. Kết quả không thay thế chẩn đoán của bác sĩ chuyên khoa.'
                  }
                </span>
              </div>
              <div>
                <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {isEn ? '2. Why do question counts vary between turns?' : '2. Tại sao số lượng câu hỏi lại thay đổi giữa các lượt?'}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  {isEn
                    ? 'The AI automatically calculates differential symptom coverage to output 3 to 5 optimal follow-up questions.'
                    : 'Hệ thống tự động phân tích độ phủ và tầm quan trọng của các triệu chứng phân biệt còn lại để đưa ra từ 3 đến 5 câu hỏi tối ưu nhất.'
                  }
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Lịch sử phản hồi của user */
        <div style={{ marginTop: '16px' }}>
          {myFeedbacksLoading ? (
            <p className="settings-modal__hint">{isEn ? 'Loading history...' : 'Đang tải lịch sử...'}</p>
          ) : myFeedbacks.length === 0 ? (
            <div className="empty-memory-state">
              <p className="empty-title">{isEn ? 'No feedback submitted yet.' : 'Chưa có phản hồi nào.'}</p>
              <p className="empty-desc">{isEn ? 'Your submitted feedback will appear here.' : 'Các phản hồi bạn gửi sẽ hiển thị tại đây.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myFeedbacks.map((fb) => (
                <div key={fb.id} className="feedback-history-card card-box">
                  <div className="fb-history-header">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className={`priority-badge priority-${fb.priority}`}>
                        {(PRIORITY_LABELS[fb.priority] ?? PRIORITY_LABELS.low)[isEn ? 'en' : 'vi']}
                      </span>
                      <span className={`category-badge category-${fb.category}`}>
                        {(CATEGORY_LABELS[fb.category] ?? CATEGORY_LABELS.other)[isEn ? 'en' : 'vi']}
                      </span>
                      <span className={`status-badge status-${fb.status}`}>
                        {(STATUS_LABELS[fb.status] ?? STATUS_LABELS.closed)[isEn ? 'en' : 'vi']}
                      </span>
                    </div>
                    <span className="text-xs text-muted">
                      {new Date(fb.createdAt).toLocaleString(isEn ? 'en-US' : 'vi-VN')}
                    </span>
                  </div>
                  <p className="fb-history-content">{fb.content}</p>
                  {fb.adminReply && (
                    <div className="admin-reply-box">
                      <strong>{isEn ? 'MedChat247 Support Reply:' : 'Phản hồi từ đội ngũ MedChat247:'}</strong>
                      <p style={{ margin: '4px 0 0' }}>{fb.adminReply}</p>
                      {fb.repliedAt && (
                        <span className="text-xs text-muted" style={{ display: 'block', marginTop: '4px' }}>
                          {new Date(fb.repliedAt).toLocaleString(isEn ? 'en-US' : 'vi-VN')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
