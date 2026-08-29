import { UrgencyBadge } from './UrgencyBadge.jsx'

// Modal xem chi tiết hội thoại: timeline tin nhắn + gắn cờ review + xuất audit.
export default function ConversationDetailModal({
  conversation,
  flagReason,
  onFlagReasonChange,
  showFlagInput,
  onShowFlagInputChange,
  onToggleFlag,
  onExportAudit,
  onClose,
}) {
  if (!conversation) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="audit-detail-modal card-glass" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header-custom">
          <div>
            <h2>{conversation.title}</h2>
            <p className="text-xs text-muted">ID: {conversation.id} | Ngày khởi tạo: {new Date(conversation.createdAt).toLocaleString('vi-VN')}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>

        <div className="audit-detail-body mt-4">
          <div className="flex-meta-header">
            <div><strong>Ngôn ngữ:</strong> <span className="uppercase">{conversation.lang}</span></div>
            <div><strong>Người dùng:</strong> {conversation.isGuest ? 'Guest (Vãng lai)' : 'Thành viên'}</div>
            <div><strong>Mức độ nguy cơ:</strong> <UrgencyBadge urgency={conversation.urgency} /></div>
            {conversation.flagged && (
              <div className="flagged-banner">
                🚩 **Cần Review:** {conversation.flaggedReason}
              </div>
            )}
          </div>

          {/* Chat Timeline history */}
          <div className="audit-timeline mt-4">
            {conversation.messages.map((m, idx) => (
              <div className={`timeline-bubble bubble-${m.role}`} key={idx}>
                <div className="bubble-header-label">
                  <strong>{m.role === 'user' ? 'Người bệnh (User)' : 'Bác sĩ ảo MedChat247'}</strong>
                  <span className="text-xs text-muted">{new Date(m.createdAt || conversation.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div className="bubble-text-content">{m.content}</div>
              </div>
            ))}
          </div>

          {/* Actions panel for audit */}
          <div className="audit-actions-panel mt-6">
            {!showFlagInput ? (
              <div className="flex-actions-row">
                <button className={`btn-audit ${conversation.flagged ? 'btn-unflag' : 'btn-flag'}`} onClick={() => {
                  if (conversation.flagged) {
                    onToggleFlag()
                  } else {
                    onShowFlagInputChange(true)
                  }
                }}>
                  {conversation.flagged ? '🚩 Gỡ cờ review' : '🚩 Đánh dấu cần review'}
                </button>
                <button className="btn-audit btn-export-json" onClick={() => onExportAudit(conversation)}>
                  Xuất File kiểm toán (CSV)
                </button>
              </div>
            ) : (
              <div className="flag-input-group card-box">
                <h4>Nhập lý do cần review hội thoại</h4>
                <textarea
                  value={flagReason}
                  onChange={(e) => onFlagReasonChange(e.target.value)}
                  placeholder="Ví dụ: Bot bỏ sót cảnh báo đau ngực dữ dội, chẩn đoán sai triệu chứng nhi..."
                  rows="2"
                />
                <div className="flag-buttons mt-2">
                  <button className="btn-table-action green" onClick={onToggleFlag}>Lưu cờ</button>
                  <button className="btn-table-action gray" onClick={() => onShowFlagInputChange(false)}>Hủy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
