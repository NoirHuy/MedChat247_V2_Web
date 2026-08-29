import { useEffect, useState } from 'react'
import { BrainIcon, LockIcon, TrashIcon } from '../Icons'
import { apiRequest } from '../../services/api'

// Tab "Trí nhớ cá nhân": tự tải và quản lý toàn bộ dữ liệu trí nhớ y tế.
export default function MemoryTab({ isEn, showToast }) {
  const [memories, setMemories] = useState([])
  const [memorySettings, setMemorySettings] = useState({
    memoryEnabled: false,
    autoRememberAllergies: true,
    autoRememberChronic: true,
    autoRememberMedications: true,
    autoRememberEpisodes: true,
  })
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [newMemoryContent, setNewMemoryContent] = useState('')
  const [newMemoryCategory, setNewMemoryCategory] = useState('allergy')
  const [newMemorySubject, setNewMemorySubject] = useState('self')

  async function loadMemoryData() {
    try {
      setMemoryLoading(true)
      const [memRes, setRes] = await Promise.all([
        apiRequest('/api/memories'),
        apiRequest('/api/memories/settings'),
      ])
      setMemories(memRes.memories || [])
      if (setRes?.settings) {
        setMemorySettings(setRes.settings)
      }
    } catch (err) {
      console.error('[Memory] Error loading memory profile:', err)
    } finally {
      setMemoryLoading(false)
    }
  }

  useEffect(() => {
    loadMemoryData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  async function handleToggleMemorySetting(key, val) {
    try {
      setMemorySettings((prev) => ({ ...prev, [key]: val }))
      const res = await apiRequest('/api/memories/settings', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: val }),
      })
      if (res?.settings) {
        setMemorySettings(res.settings)
      }
      showToast?.(isEn ? 'Memory settings updated.' : 'Đã cập nhật cài đặt trí nhớ.')
    } catch (err) {
      setMemorySettings((prev) => ({ ...prev, [key]: !val }))
      showToast?.(err.message || (isEn ? 'Could not save settings.' : 'Không thể lưu cài đặt.'))
    }
  }

  async function handleAddMemorySubmit(e) {
    e.preventDefault()
    if (!newMemoryContent.trim()) return
    const criticalCats = ['allergy', 'chronic_condition', 'blood_type', 'pregnancy']
    const importance = criticalCats.includes(newMemoryCategory) ? 'critical' : 'medium'
    try {
      const { memory } = await apiRequest('/api/memories', {
        method: 'POST',
        body: JSON.stringify({
          content: newMemoryContent.trim(),
          category: newMemoryCategory,
          subject: newMemorySubject,
          importance,
        }),
      })
      setMemories((prev) => [memory, ...prev])
      setNewMemoryContent('')
      showToast?.(isEn ? 'Added new memory entry.' : 'Đã thêm mục trí nhớ mới.')
    } catch (err) {
      showToast?.(err.message || (isEn ? 'Could not add memory.' : 'Không thể thêm trí nhớ.'))
    }
  }

  async function handleToggleLockSingleMemory(id, currentLockStatus) {
    try {
      const nextLock = !currentLockStatus
      await apiRequest(`/api/memories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isLocked: nextLock }),
      })
      setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, isLocked: nextLock } : m)))
      showToast?.(
        nextLock
          ? (isEn ? 'Memory record locked.' : 'Đã khóa ký ức (AI không được tự ý ghi đè).')
          : (isEn ? 'Memory record unlocked.' : 'Đã mở khóa ký ức.'),
      )
    } catch (err) {
      showToast?.(err.message || (isEn ? 'Could not change lock status.' : 'Không thể thay đổi trạng thái khóa.'))
    }
  }

  async function handleDeleteSingleMemory(id) {
    const confirmMsg = isEn ? 'Are you sure you want to delete this memory entry?' : 'Bạn có chắc chắn muốn xóa mục trí nhớ này khỏi hồ sơ?'
    if (!window.confirm(confirmMsg)) return
    try {
      await apiRequest(`/api/memories/${id}`, { method: 'DELETE' })
      setMemories((prev) => prev.filter((m) => m.id !== id))
      showToast?.(isEn ? 'Memory entry deleted.' : 'Đã xóa mục trí nhớ.')
    } catch (err) {
      showToast?.(err.message || (isEn ? 'Could not delete memory entry.' : 'Không thể xóa mục trí nhớ.'))
    }
  }

  async function handleClearAllMemoriesClick() {
    const confirmMsg = isEn ? 'WARNING: This will clear your entire medical memory profile. Are you sure?' : 'CẢNH BÁO: Hành động này sẽ XÓA MỀM toàn bộ hồ sơ trí nhớ y tế của bạn. Bạn có chắc chắn không?'
    if (!window.confirm(confirmMsg)) return
    try {
      await apiRequest('/api/memories', { method: 'DELETE' })
      setMemories([])
      showToast?.(isEn ? 'All memories cleared.' : 'Đã xóa toàn bộ hồ sơ trí nhớ.')
    } catch (err) {
      showToast?.(err.message || (isEn ? 'Could not clear memories.' : 'Không thể xóa toàn bộ.'))
    }
  }

  function handleExportMemoryProfileClick() {
    window.open('/api/memories/export', '_blank')
  }

  return (
    <section>
      <div className="memory-tab-header">
        <div>
          <h2>{isEn ? 'Personal Smart AI Memory' : 'Trí nhớ thông minh cá nhân'}</h2>
          <p className="settings-modal__hint">
            {isEn
              ? 'System automatically remembers medical history to personalize consultations. All data encrypted with AES-256-GCM.'
              : 'Hệ thống tự động ghi nhớ và cá nhân hóa trải nghiệm tham vấn dựa trên tiền sử y tế của bạn. Tất cả dữ liệu được mã hóa AES-256-GCM bảo mật tuyệt đối.'
            }
          </p>
        </div>
        <button
          className="btn btn--outline btn--sm"
          onClick={handleExportMemoryProfileClick}
          title={isEn ? 'Export personal medical history profile' : 'Tải về tóm tắt tiền sử y tế cá nhân dạng tệp văn bản'}
        >
          📄 {isEn ? 'Export Profile (.txt)' : 'Xuất hồ sơ (.txt)'}
        </button>
      </div>

      {/* TÙY CHỈNH TỰ ĐỘNG GHI NHỚ */}
      <div className="settings-section-box">
        <h3 className="settings-subheading">
          <BrainIcon /> {isEn ? 'Automatic Memory Settings' : 'Cấu hình Tự động Ghi nhớ'}
        </h3>

        <div className="auto-renew-row">
          <div className="auto-renew-text">
            <strong>{isEn ? 'Enable Smart Medical Memory' : 'Bật tính năng Trí nhớ thông minh'}</strong>
            <p className="auto-renew-hint">
              {memorySettings?.memoryEnabled
                ? (isEn ? 'ACTIVE. Allows AI to reference and auto-extract medical history.' : 'Đang BẬT. Cho phép AI tham khảo và tự động trích xuất tiền sử y tế của bạn.')
                : (isEn ? 'OFF. AI will not reference or extract personal memory records.' : 'Đang TẮT. AI sẽ không tham khảo hoặc trích xuất dữ liệu trí nhớ cá nhân.')
              }
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={Boolean(memorySettings?.memoryEnabled)}
              onChange={(e) => handleToggleMemorySetting('memoryEnabled', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {memorySettings.memoryEnabled !== false && (
          <div className="memory-category-toggles">
            <span className="memory-toggles-title">{isEn ? 'Category-based auto-remember:' : 'Ghi nhớ theo từng danh mục:'}</span>
            <div className="memory-toggles-grid">
              <label className="memory-checkbox-item">
                <input
                  type="checkbox"
                  checked={memorySettings.autoRememberAllergies !== false}
                  onChange={(e) => handleToggleMemorySetting('autoRememberAllergies', e.target.checked)}
                />
                <span>🚨 {isEn ? 'Drug & food allergies' : 'Dị ứng thuốc & thức ăn'}</span>
              </label>
              <label className="memory-checkbox-item">
                <input
                  type="checkbox"
                  checked={memorySettings.autoRememberChronic !== false}
                  onChange={(e) => handleToggleMemorySetting('autoRememberChronic', e.target.checked)}
                />
                <span>🏥 {isEn ? 'Chronic conditions' : 'Bệnh nền mãn tính'}</span>
              </label>
              <label className="memory-checkbox-item">
                <input
                  type="checkbox"
                  checked={memorySettings.autoRememberMedications !== false}
                  onChange={(e) => handleToggleMemorySetting('autoRememberMedications', e.target.checked)}
                />
                <span>💊 {isEn ? 'Active medications' : 'Thuốc đang sử dụng'}</span>
              </label>
              <label className="memory-checkbox-item">
                <input
                  type="checkbox"
                  checked={memorySettings.autoRememberEpisodes !== false}
                  onChange={(e) => handleToggleMemorySetting('autoRememberEpisodes', e.target.checked)}
                />
                <span>📋 {isEn ? 'Short-term episodes (90 days)' : 'Đợt bệnh ngắn hạn (90 ngày)'}</span>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="settings-divider" />

      {/* FORM THÊM TRÍ NHỚ THỦ CÔNG */}
      <div className="settings-section-box">
        <h3 className="settings-subheading">
          ➕ {isEn ? 'Add Manual Medical History Record' : 'Thêm tiền sử y tế thủ công'}
        </h3>

        <form onSubmit={handleAddMemorySubmit} className="memory-add-form-box">
          <div className="memory-form-row">
            <label className="settings-field">
              <span>{isEn ? 'Category' : 'Danh mục'}</span>
              <select
                className="memory-select-input"
                value={newMemoryCategory}
                onChange={(e) => setNewMemoryCategory(e.target.value)}
              >
                <option value="allergy">🚨 {isEn ? 'Allergy' : 'Dị ứng (Allergy)'}</option>
                <option value="chronic_condition">🏥 {isEn ? 'Chronic Condition' : 'Bệnh nền (Chronic)'}</option>
                <option value="medication">💊 {isEn ? 'Medication' : 'Thuốc đang dùng (Medication)'}</option>
                <option value="blood_type">🩸 {isEn ? 'Blood Type' : 'Nhóm máu (Blood Type)'}</option>
                <option value="pregnancy">👶 {isEn ? 'Pregnancy' : 'Thai kỳ (Pregnancy)'}</option>
                <option value="past_episode">📋 {isEn ? 'Past Episode' : 'Đợt bệnh trước (Past Episode)'}</option>
                <option value="lifestyle">🏃 {isEn ? 'Lifestyle' : 'Lối sống (Lifestyle)'}</option>
                <option value="display_preference">⚙️ {isEn ? 'Display Preference' : 'Hiển thị (Preference)'}</option>
              </select>
            </label>

            <label className="settings-field">
              <span>{isEn ? 'Subject' : 'Chủ thể'}</span>
              <select
                className="memory-select-input"
                value={newMemorySubject}
                onChange={(e) => setNewMemorySubject(e.target.value)}
              >
                <option value="self">👤 {isEn ? 'Myself' : 'Bản thân tôi'}</option>
                <option value="family">👨‍👩‍👧 {isEn ? 'Family History' : 'Tiền sử gia đình'}</option>
              </select>
            </label>
          </div>

          <label className="settings-field">
            <span>{isEn ? 'Medical Record Description' : 'Nội dung tiền sử y tế'}</span>
            <input
              type="text"
              placeholder={isEn ? 'e.g., Severe Penicillin Allergy, Type 2 Diabetes...' : 'Nhập thông tin (ví dụ: Dị ứng Penicillin nặng, Đái tháo đường Tuýp 2...)'}
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
              required
            />
          </label>

          <div className="memory-form-actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={!newMemoryContent.trim()}>
              {isEn ? 'Add to Memory' : 'Thêm vào hồ sơ'}
            </button>
          </div>
        </form>
      </div>

      <div className="settings-divider" />

      {/* DANH SÁCH MỤC TRÍ NHỚ ĐÃ LƯU */}
      <div className="settings-section-box">
        <div className="memory-list-header">
          <h3 className="settings-subheading" style={{ margin: 0 }}>
            <BrainIcon /> {isEn ? `Personal Memory Profile (${memories.length} entries)` : `Hồ sơ Trí nhớ cá nhân (${memories.length} mục)`}
          </h3>
          {memories.length > 0 && (
            <button
              className="btn btn--danger-outline btn--sm"
              onClick={handleClearAllMemoriesClick}
            >
              <TrashIcon /> {isEn ? 'Clear All' : 'Xóa toàn bộ'}
            </button>
          )}
        </div>

        {memoryLoading ? (
          <p className="settings-modal__hint text-center" style={{ padding: '16px 0' }}>
            {isEn ? 'Loading encrypted memory profile...' : 'Đang tải dữ liệu trí nhớ mã hóa...'}
          </p>
        ) : memories.length === 0 ? (
          <div className="empty-memory-state">
            <p className="empty-title">{isEn ? 'No medical memory entries stored yet.' : 'Chưa có thông tin trí nhớ y tế nào được lưu.'}</p>
            <p className="empty-desc">{isEn ? 'As you chat with MedChat247 or enter data above, important medical history will appear here.' : 'Khi bạn trò chuyện với MedChat247 hoặc nhập ở trên, các thông tin y tế quan trọng sẽ tự động xuất hiện tại đây.'}</p>
          </div>
        ) : (
          <div className="memory-cards-container">
            {memories.map((mem) => (
              <div className={`memory-item-card ${mem.isLocked ? 'memory-item-card--locked' : ''}`} key={mem.id}>
                <div className="memory-item-top">
                  <div className="memory-tags-group">
                    <span className={`status-pill status-pill--${mem.category === 'allergy' ? 'free' : 'active'}`}>
                      {mem.category === 'allergy' && (isEn ? '🚨 Allergy' : '🚨 Dị ứng')}
                      {mem.category === 'chronic_condition' && (isEn ? '🏥 Chronic' : '🏥 Bệnh nền')}
                      {mem.category === 'medication' && (isEn ? '💊 Medication' : '💊 Thuốc dùng')}
                      {mem.category === 'blood_type' && (isEn ? '🩸 Blood Type' : '🩸 Nhóm máu')}
                      {mem.category === 'pregnancy' && (isEn ? '👶 Pregnancy' : '👶 Thai kỳ')}
                      {mem.category === 'past_episode' && (isEn ? '📋 Episode' : '📋 Đợt bệnh')}
                      {mem.category === 'lifestyle' && (isEn ? '🏃 Lifestyle' : '🏃 Lối sống')}
                      {mem.category === 'display_preference' && (isEn ? '⚙️ Display' : '⚙️ Hiển thị')}
                    </span>
                    <span className="memory-subject-tag">
                      {mem.subject === 'family' ? (isEn ? '👨‍👩‍👧 Family' : '👨‍👩‍👧 Gia đình') : (isEn ? '👤 Self' : '👤 Bản thân')}
                    </span>
                    {mem.isLocked && (
                      <span className="memory-locked-tag">🔒 {isEn ? 'Locked' : 'Khóa thủ công'}</span>
                    )}
                  </div>
                  <span className="memory-source-meta">
                    {mem.source === 'manual' ? (isEn ? 'Manual' : 'Thủ công') : (isEn ? 'AI Extracted' : 'AI Trích xuất')} (v{mem.version || 1})
                  </span>
                </div>

                <p className="memory-item-content">{mem.content}</p>

                <div className="memory-item-bottom">
                  <span className="memory-item-date">
                    {isEn ? 'Updated: ' : 'Cập nhật: '}{new Date(mem.updatedAt || mem.createdAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')}
                  </span>
                  <div className="memory-item-actions">
                    <button
                      className={`btn-icon-action ${mem.isLocked ? 'btn-icon-action--active' : ''}`}
                      onClick={() => handleToggleLockSingleMemory(mem.id, mem.isLocked)}
                      title={mem.isLocked ? (isEn ? 'Unlock (Allow AI updates)' : 'Mở khóa (Cho phép AI cập nhật)') : (isEn ? 'Lock (Prevent AI overwrite)' : 'Khóa (Khống chế không cho AI ghi đè)')}
                    >
                      <LockIcon />
                    </button>
                    <button
                      className="btn-icon-action btn-icon-action--danger"
                      onClick={() => handleDeleteSingleMemory(mem.id)}
                      title={isEn ? 'Delete entry' : 'Xóa mục trí nhớ này'}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HỘP CẢNH BÁO PHÁP LÝ */}
      <div className="settings-info-badge" style={{ marginTop: '16px', background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.25)' }}>
        <span>⚠️</span>
        <p>
          <strong>{isEn ? 'Medical Disclaimer:' : 'Khuyến cáo pháp lý Y tế:'}</strong> {isEn
            ? 'Information stored in Personal Memory is used solely to personalize medical reference suggestions, does not constitute an official medical record, and does not replace clinical physician diagnosis.'
            : 'Thông tin trong Trí nhớ cá nhân được sử dụng nhằm mục đích cá nhân hóa các gợi ý tham khảo y tế, không phải là Hồ sơ bệnh án y tế chính thức và không thay thế chẩn đoán lâm sàng của bác sĩ chuyên khoa.'
          }
        </p>
      </div>
    </section>
  )
}
