import { useState } from 'react'
import { LockIcon, TrashIcon } from '../Icons'

// Tab "Tài khoản": hồ sơ, đổi mật khẩu, xóa tài khoản.
export default function AccountTab({ account, isEn, onUpdateName, onChangePassword, onSignOut, onDeleteAccount, showToast, onClose }) {
  const [nameDraft, setNameDraft] = useState(account?.name || '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const isGoogleAccount = account.provider === 'google'

  async function handleChangePasswordSubmit(e) {
    e.preventDefault()
    setPasswordStatus(null)

    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', text: isEn ? 'New password must be at least 6 characters.' : 'Mật khẩu mới phải có ít nhất 6 ký tự.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', text: isEn ? 'Confirm password does not match.' : 'Mật khẩu xác nhận không trùng khớp.' })
      return
    }

    try {
      setPasswordLoading(true)
      await onChangePassword({ oldPassword, newPassword })
      setPasswordStatus({ type: 'success', text: isEn ? 'Password changed successfully!' : 'Đổi mật khẩu thành công!' })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showToast?.(isEn ? 'Password changed successfully!' : 'Đổi mật khẩu thành công!')
    } catch (err) {
      setPasswordStatus({ type: 'error', text: err.message || (isEn ? 'Could not change password.' : 'Không thể đổi mật khẩu.') })
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleDeleteAccountClick() {
    const promptMsg = isEn
      ? 'Type DELETE to confirm permanent account deletion:'
      : 'Nhập DELETE để xác nhận xóa vĩnh viễn tài khoản và dữ liệu:'
    const confirmed = window.prompt(promptMsg)
    if (confirmed !== 'DELETE') return
    setDeleteLoading(true)
    try {
      await onDeleteAccount?.()
      onClose()
      showToast?.(isEn ? 'Account and data permanently deleted.' : 'Tài khoản và dữ liệu cá nhân đã được xóa.')
    } catch (err) {
      showToast?.(err.message || (isEn ? 'Could not delete account.' : 'Không thể xóa tài khoản.'))
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <section>
      <h2>{isEn ? 'Account Profile' : 'Hồ sơ tài khoản'}</h2>
      <p className="settings-modal__hint">
        {isEn
          ? 'Your personal profile information is securely stored on system databases.'
          : 'Thông tin tài khoản cá nhân được lưu trữ an toàn trên cơ sở dữ liệu hệ thống.'
        }
      </p>

      {/* CARD 1: HỒ SƠ CÁ NHÂN */}
      <div className="settings-section-box">
        <label className="settings-field">
          <span>{isEn ? 'Display Name' : 'Tên hiển thị'}</span>
          <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
        </label>
        <label className="settings-field">
          <span>Email</span>
          <input value={account.email} disabled />
        </label>
        <div className="settings-modal__actions" style={{ marginTop: '12px' }}>
          <button className="btn btn--primary" onClick={() => onUpdateName(nameDraft)}>
            {isEn ? 'Save Profile Name' : 'Lưu thay đổi tên'}
          </button>
          <button className="btn btn--danger-outline" onClick={onSignOut}>
            {isEn ? 'Log Out' : 'Đăng xuất'}
          </button>
        </div>
      </div>

      <div className="settings-divider" />

      {/* CARD 2: ĐỔI MẬT KHẨU */}
      <div className="settings-section-box">
        <h3 className="settings-subheading">
          <LockIcon /> {isEn ? 'Change Password' : 'Đổi mật khẩu'}
        </h3>

        {isGoogleAccount ? (
          <div className="settings-info-badge">
            <span>🔒</span>
            <p>
              {isEn
                ? 'Your account uses Google OAuth login, so a separate password is not set.'
                : 'Tài khoản của bạn đăng nhập bằng Google OAuth nên không sử dụng mật khẩu riêng.'
              }
            </p>
          </div>
        ) : (
          <form onSubmit={handleChangePasswordSubmit} className="change-password-form">
            {passwordStatus && (
              <div className={`settings-alert settings-alert--${passwordStatus.type}`}>
                {passwordStatus.text}
              </div>
            )}
            <label className="settings-field">
              <span>{isEn ? 'Current Password' : 'Mật khẩu hiện tại'}</span>
              <input
                type="password"
                placeholder={isEn ? 'Enter current password...' : 'Nhập mật khẩu hiện tại...'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>{isEn ? 'New Password' : 'Mật khẩu mới'}</span>
              <input
                type="password"
                placeholder={isEn ? 'At least 6 characters...' : 'Tối thiểu 6 ký tự...'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            <label className="settings-field">
              <span>{isEn ? 'Confirm New Password' : 'Xác nhận mật khẩu mới'}</span>
              <input
                type="password"
                placeholder={isEn ? 'Re-enter new password...' : 'Nhập lại mật khẩu mới...'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
            <div style={{ marginTop: '14px' }}>
              <button type="submit" className="btn btn--primary" disabled={passwordLoading}>
                {passwordLoading ? (isEn ? 'Updating...' : 'Đang cập nhật...') : (isEn ? 'Update Password' : 'Cập nhật mật khẩu')}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="settings-divider" />

      {/* CARD 3: XÓA TÀI KHOẢN */}
      <div className="settings-section-box settings-section-box--danger">
        <h3 className="settings-subheading">{isEn ? 'Delete Account' : 'Xóa tài khoản'}</h3>
        <p className="settings-modal__hint">
          {isEn
            ? 'Permanently delete your profile, conversations, memories, and feedback history. This action cannot be undone.'
            : 'Xóa vĩnh viễn hồ sơ, hội thoại, trí nhớ cá nhân và phản hồi. Thao tác này không thể hoàn tác.'
          }
        </p>
        <button
          className="btn btn--danger-outline"
          disabled={deleteLoading}
          onClick={handleDeleteAccountClick}
        >
          <TrashIcon /> {deleteLoading ? (isEn ? 'Deleting...' : 'Đang xóa...') : (isEn ? 'Permanently Delete Account' : 'Xóa tài khoản vĩnh viễn')}
        </button>
      </div>
    </section>
  )
}
