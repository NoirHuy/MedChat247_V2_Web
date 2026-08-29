const STATUS_OPTIONS = [
  { value: 'new', label: 'Mới' },
  { value: 'read', label: 'Đã đọc' },
  { value: 'in_progress', label: 'Đang xử lý' },
  { value: 'resolved', label: 'Đã giải quyết' },
  { value: 'closed', label: 'Đã đóng' },
]

function categoryLabel(category) {
  switch (category) {
    case 'help': return 'Trợ giúp'
    case 'bug': return 'Báo lỗi'
    case 'feature': return 'Tính năng'
    case 'question': return 'Câu hỏi'
    case 'complaint': return 'Khiếu nại'
    default: return 'Khác'
  }
}

function priorityLabel(priority) {
  switch (priority) {
    case 'urgent': return 'Khẩn cấp'
    case 'high': return 'Cao'
    case 'medium': return 'Trung bình'
    default: return 'Thấp'
  }
}

// Modal xử lý phản hồi của admin (trạng thái, ghi chú nội bộ, phản hồi user).
export default function FeedbackDetailModal({
  feedback,
  statusUpdate,
  onStatusUpdateChange,
  notesText,
  onNotesTextChange,
  replyText,
  onReplyTextChange,
  saving,
  onSave,
  onClose,
}) {
  if (!feedback) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="audit-detail-modal card-glass" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <header className="modal-header-custom">
          <div>
            <h2>Chi tiết phản hồi</h2>
            <p className="text-xs text-muted">
              ID: {feedback.id} | Gửi: {feedback.createdAt ? new Date(feedback.createdAt).toLocaleString('vi-VN') : '—'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>

        <div className="audit-detail-body mt-4">
          {/* Meta info */}
          <div className="flex-meta-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong>Người gửi:</strong>{' '}
              {feedback.isAnonymous ? 'Khách ẩn danh' : (feedback.user?.name || feedback.userName)}
            </div>
            {!feedback.isAnonymous && (
              <div><strong>Email:</strong> {feedback.user?.email || feedback.userEmail || '—'}</div>
            )}
            <div>
              <span className={`category-badge category-${feedback.category}`}>
                {categoryLabel(feedback.category)}
              </span>
            </div>
            <div>
              <span className={`priority-badge priority-${feedback.priority}`}>
                {priorityLabel(feedback.priority)}
              </span>
            </div>
            {feedback.adminReply && (
              <div className="flagged-banner" style={{ background: 'rgba(14, 165, 233, 0.08)', borderColor: '#0ea5e9', color: '#0ea5e9' }}>
                Đã phản hồi bởi {feedback.replierName || 'Admin'} ({feedback.repliedAt ? new Date(feedback.repliedAt).toLocaleString('vi-VN') : '—'})
              </div>
            )}
          </div>

          {/* Nội dung phản hồi */}
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>NỘI DUNG PHẢN HỒI</h4>
            <div className="card-box" style={{ padding: '14px' }}>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{feedback.content}</p>
            </div>
          </div>

          {/* Admin reply (nếu có) */}
          {feedback.adminReply && (
            <div style={{ marginTop: '14px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#0ea5e9', marginBottom: '8px' }}>PHẢN HỒI CỦA ADMIN</h4>
              <div style={{
                padding: '12px 14px',
                background: 'rgba(14, 165, 233, 0.08)',
                borderLeft: '3px solid #0ea5e9',
                borderRadius: '0 8px 8px 0',
                fontSize: '13px',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
              }}>
                {feedback.adminReply}
              </div>
            </div>
          )}

          {/* Admin reply form */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px' }}>
              XỬ LÝ BỞI ADMIN
            </h4>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Trạng thái</label>
                <select
                  value={statusUpdate}
                  onChange={(e) => onStatusUpdateChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-hover)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                  }}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Ghi chú nội bộ (không hiển thị cho user)
                </label>
                <textarea
                  value={notesText}
                  onChange={(e) => onNotesTextChange(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú riêng của admin..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-hover)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Phản hồi cho user {feedback.category !== 'help' && <span style={{ fontStyle: 'italic' }}>(chỉ gửi khi cần)</span>}
                </label>
                <textarea
                  value={replyText}
                  onChange={(e) => onReplyTextChange(e.target.value)}
                  rows={3}
                  placeholder="Nhập phản hồi để gửi cho user..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-hover)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
              <button className="btn btn--primary btn--sm" onClick={onSave} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu cập nhật'}
              </button>
              <button className="btn btn--outline btn--sm" onClick={onClose}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
