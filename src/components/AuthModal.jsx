import { useState, useEffect } from 'react'
import {
  CloseIcon,
  GoogleIcon,
  EyeIcon,
  EyeOffIcon,
  SpinnerIcon,
  UserCircleIcon,
} from './Icons'
import GoogleAuthButton from './GoogleAuthButton'
import { isGoogleAuthConfigured, setDynamicGoogleClientId, getGoogleClientId } from '../utils/googleAuthConfig'
import { MOCK_GOOGLE_ACCOUNT } from '../data/account'
import { apiUrl } from '../services/api'
import './SettingsModal.css'
import './AccountMenu.css'
import './AuthModal.css'

export default function AuthModal({
  initialTab = 'signin',
  lang = 'vi',
  onClose,
  onSignUpForm,
  onVerifySignUpEmail,
  onRequestPasswordReset,
  onConfirmPasswordReset,
  onSignInForm,
  onSignInWithGoogle,
  onAuthed,
}) {
  const isEn = lang === 'en'
  const [tab, setTab] = useState(initialTab)
  const [googlePicker, setGooglePicker] = useState(false)
  const [customGoogleEmail, setCustomGoogleEmail] = useState('')
  const [showCustomGoogle, setShowCustomGoogle] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [fetchedGoogleClientId, setFetchedGoogleClientId] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!isGoogleAuthConfigured()) {
      fetch(apiUrl('/api/auth/config'))
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.googleClientId && !cancelled) {
            setDynamicGoogleClientId(data.googleClientId)
            setFetchedGoogleClientId(data.googleClientId)
          }
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [])

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [termsConsent, setTermsConsent] = useState(false)
  const [authStep, setAuthStep] = useState('form')
  const [verificationCode, setVerificationCode] = useState('')

  function switchTab(nextTab) {
    setTab(nextTab)
    setError(null)
    setGooglePicker(false)
    setShowCustomGoogle(false)
    setAuthStep('form')
    setVerificationCode('')
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    setError(null)

    if (tab === 'signup' && password !== confirmPassword) {
      setError(isEn ? 'Confirm password does not match.' : 'Mật khẩu xác nhận không khớp.')
      return
    }

    if (tab === 'signup' && !termsConsent) {
      setError(
        isEn
          ? 'You must agree to the Terms of Service & Privacy Policy.'
          : 'Bạn cần đồng ý với Điều khoản & Chính sách bảo mật dữ liệu y tế.',
      )
      return
    }

    setLoading(true)
    try {
      if (tab === 'signup') {
        await onSignUpForm({ name, email, password })
        setAuthStep('signup-verify')
        return
      }
      const user = await onSignInForm({ email, password })
      onAuthed(user, isEn ? 'Logged in successfully!' : 'Đăng nhập thành công!')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerificationSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (authStep === 'signup-verify') {
        const user = await onVerifySignUpEmail({ email, code: verificationCode })
        onAuthed(user, isEn ? 'Email verified. Account created successfully!' : 'Email đã được xác minh. Tạo tài khoản thành công!')
      } else {
        await onConfirmPasswordReset({ email, code: verificationCode, password })
        setAuthStep('form')
        setTab('signin')
        setPassword('')
        setVerificationCode('')
        setError(isEn ? 'Password reset successful. Please sign in.' : 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    setError(null)
    if (!email.trim()) {
      setError(isEn ? 'Enter your email first.' : 'Vui lòng nhập email trước.')
      return
    }
    setLoading(true)
    try {
      await onRequestPasswordReset(email)
      setAuthStep('reset-verify')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleChoose(chosenEmail, chosenName) {
    setError(null)
    setLoading(true)
    try {
      const user = await onSignInWithGoogle({ email: chosenEmail, name: chosenName })
      onAuthed(user, isEn ? 'Signed in with Google successfully!' : 'Đăng nhập bằng Google thành công!')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleCredential(credential) {
    setError(null)
    setLoading(true)
    try {
      const user = await onSignInWithGoogle({ credential })
      onAuthed(user, isEn ? 'Signed in with Google successfully!' : 'Đăng nhập bằng Google thành công!')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="settings-modal__close" onClick={onClose} aria-label={isEn ? 'Close' : 'Đóng'}>
          <CloseIcon />
        </button>

        <h2 className="auth-modal__title">
          {isEn ? 'Welcome to MedChat247' : 'Chào mừng đến với MedChat247'}
        </h2>
        <p className="auth-modal__subtitle">
          {isEn
            ? 'Sign in to save chat history and manage your plan.'
            : 'Đăng nhập để lưu lịch sử trò chuyện và quản lý gói sử dụng của bạn.'}
        </p>

        <div className="auth-modal__tabs">
          <button
            className={`auth-modal__tab ${tab === 'signin' ? 'auth-modal__tab--active' : ''}`}
            onClick={() => switchTab('signin')}
          >
            {isEn ? 'Sign in' : 'Đăng nhập'}
          </button>
          <button
            className={`auth-modal__tab ${tab === 'signup' ? 'auth-modal__tab--active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            {isEn ? 'Sign up' : 'Đăng ký'}
          </button>
        </div>

        {authStep !== 'form' ? (
          <form className="auth-modal__form" onSubmit={handleVerificationSubmit} autoComplete="off">
            <h3 className="auth-modal__step-title">
              {authStep === 'signup-verify'
                ? (isEn ? 'Verify your email' : 'Xác minh email')
                : (isEn ? 'Reset password' : 'Đặt lại mật khẩu')}
            </h3>
            <p className="auth-modal__step-hint">
              {isEn
                ? `We sent a 6-digit verification code to ${email}. It expires in 10 minutes.`
                : `Chúng tôi đã gửi mã xác minh 6 số đến ${email}. Mã hết hạn sau 10 phút.`}
            </p>
            <p className="auth-modal__spam-notice">
              💡 {isEn
                ? 'If you do not see the email in your Inbox, please check your Spam, Junk, or Bulk folder.'
                : 'Nếu không thấy email trong Hộp thư đến (Inbox), vui lòng kiểm tra thêm trong thư mục Spam hoặc Thư rác.'}
            </p>
            <label className="settings-field">
              <span>{isEn ? 'Verification code' : 'Mã xác minh'}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
                required
              />
            </label>
            {authStep === 'reset-verify' && (
              <label className="settings-field">
                <span>{isEn ? 'New password' : 'Mật khẩu mới'}</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}
            {error && <p className="auth-modal__error">{error}</p>}
            <button className="btn btn--primary auth-modal__submit" disabled={loading || verificationCode.length !== 6}>
              {loading ? <SpinnerIcon /> : (isEn ? 'Confirm' : 'Xác nhận')}
            </button>
            <button type="button" className="auth-modal__back" onClick={() => { setAuthStep('form'); setError(null) }}>
              {isEn ? 'Back' : 'Quay lại'}
            </button>
          </form>
        ) : googlePicker ? (
          <div className="google-picker">
            <p className="google-picker__hint">
              {isEn ? 'Select a Google account (simulated)' : 'Chọn một tài khoản Google (mô phỏng)'}
            </p>
            <button
              className="google-picker__account"
              disabled={loading}
              onClick={() => handleGoogleChoose(MOCK_GOOGLE_ACCOUNT.email, MOCK_GOOGLE_ACCOUNT.name)}
            >
              <span className="account-avatar">
                {MOCK_GOOGLE_ACCOUNT.name.charAt(0).toUpperCase()}
              </span>
              <span className="google-picker__account-text">
                <span className="account-menu__name">{MOCK_GOOGLE_ACCOUNT.name}</span>
                <span className="account-menu__email">{MOCK_GOOGLE_ACCOUNT.email}</span>
              </span>
            </button>

            {showCustomGoogle ? (
              <form
                className="google-picker__custom-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!customGoogleEmail.trim()) return
                  handleGoogleChoose(customGoogleEmail.trim())
                }}
              >
                <input
                  type="email"
                  placeholder={isEn ? 'account@gmail.com' : 'taikhoang@gmail.com'}
                  value={customGoogleEmail}
                  onChange={(e) => setCustomGoogleEmail(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn btn--primary" disabled={loading}>
                  {loading ? <SpinnerIcon /> : isEn ? 'Continue' : 'Tiếp tục'}
                </button>
              </form>
            ) : (
              <button
                className="google-picker__account google-picker__account--ghost"
                onClick={() => setShowCustomGoogle(true)}
              >
                <span className="account-avatar account-avatar--ghost">
                  <UserCircleIcon />
                </span>
                <span className="google-picker__account-text">
                  <span className="account-menu__name">
                    {isEn ? 'Use another Gmail account' : 'Sử dụng tài khoản Gmail khác'}
                  </span>
                </span>
              </button>
            )}

            {error && <p className="auth-modal__error">{error}</p>}

            <button
              className="auth-modal__back"
              onClick={() => {
                setGooglePicker(false)
                setError(null)
              }}
            >
              {isEn ? '← Back' : '← Quay lại'}
            </button>
          </div>
        ) : (
          <>
            {isGoogleAuthConfigured() || fetchedGoogleClientId ? (
              <GoogleAuthButton onCredential={handleGoogleCredential} />
            ) : import.meta.env.DEV ? (
              // Mock account picker — dev convenience only, never shipped to
              // production builds.
              <button
                className="google-btn"
                onClick={() => {
                  setError(null)
                  if (isGoogleAuthConfigured() && window.google?.accounts?.id) {
                    window.google.accounts.id.initialize({
                      client_id: getGoogleClientId(),
                      callback: (res) => handleGoogleCredential(res.credential),
                    })
                    window.google.accounts.id.prompt()
                  } else {
                    setGooglePicker(true)
                  }
                }}
              >
                <GoogleIcon />
                <span>{isEn ? 'Continue with Google' : 'Tiếp tục sử dụng dịch vụ bằng Google'}</span>
              </button>
            ) : null}

            <div className="auth-modal__divider">
              <span>{isEn ? 'or' : 'hoặc'}</span>
            </div>

            <form className="auth-modal__form" onSubmit={handleFormSubmit} autoComplete="off">
              {tab === 'signup' && (
                <label className="settings-field">
                  <span>{isEn ? 'Full name' : 'Họ tên'}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isEn ? 'John Doe' : 'Nguyễn Văn A'}
                    autoComplete="off"
                    required
                  />
                </label>
              )}

              <label className="settings-field">
                <span>{isEn ? 'Email' : 'Email'}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isEn ? 'account@gmail.com' : 'taikhoang@gmail.com'}
                  autoComplete="off"
                  required
                />
              </label>

              <label className="settings-field">
                <span>{isEn ? 'Password' : 'Mật khẩu'}</span>
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isEn ? 'At least 6 characters' : 'Tối thiểu 6 ký tự'}
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-input__toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? (isEn ? 'Hide password' : 'Ẩn mật khẩu') : (isEn ? 'Show password' : 'Hiện mật khẩu')}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>

              {tab === 'signup' && (
                <>
                  <label className="settings-field">
                    <span>{isEn ? 'Confirm password' : 'Xác nhận mật khẩu'}</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={isEn ? 'Re-enter password' : 'Nhập lại mật khẩu'}
                      minLength={6}
                      required
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', margin: '10px 0 14px' }}>
                    <input
                      type="checkbox"
                      checked={termsConsent}
                      onChange={(e) => setTermsConsent(e.target.checked)}
                      required
                      style={{ marginTop: '3px', accentColor: 'var(--bg-accent)', width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.45' }}>
                      {isEn ? (
                        <>I agree to the <a href="/terms" target="_blank" rel="noreferrer"><strong>Terms of Service</strong></a> and <a href="/privacy-policy" target="_blank" rel="noreferrer"><strong>Medical Data Privacy Policy</strong></a> of MedChat247.</>
                      ) : (
                        <>Tôi đồng ý với <a href="/terms" target="_blank" rel="noreferrer"><strong>Điều khoản sử dụng</strong></a> và <a href="/privacy-policy" target="_blank" rel="noreferrer"><strong>Chính sách bảo mật dữ liệu y tế</strong></a> MedChat247.</>
                      )}
                    </span>
                  </label>
                </>
              )}

              {error && <p className="auth-modal__error">{error}</p>}

              {tab === 'signin' && (
                <button type="button" className="auth-modal__forgot-password" onClick={handleForgotPassword} disabled={loading}>
                  {isEn ? 'Forgot password?' : 'Quên mật khẩu?'}
                </button>
              )}

              <button className="btn btn--primary auth-modal__submit" disabled={loading}>
                {loading ? (
                  <SpinnerIcon />
                ) : tab === 'signup' ? (
                  isEn ? 'Create account' : 'Tạo tài khoản'
                ) : (
                  isEn ? 'Sign in' : 'Đăng nhập'
                )}
              </button>
            </form>

            <p className="auth-modal__switch">
              {tab === 'signup' ? (
                <>
                  {isEn ? 'Already have an account?' : 'Đã có tài khoản?'}{' '}
                  <button onClick={() => switchTab('signin')}>{isEn ? 'Sign in' : 'Đăng nhập'}</button>
                </>
              ) : (
                <>
                  {isEn ? "Don't have an account?" : 'Chưa có tài khoản?'}{' '}
                  <button onClick={() => switchTab('signup')}>{isEn ? 'Sign up' : 'Đăng ký'}</button>
                </>
              )}
            </p>
          </>
        )}

        <p className="auth-modal__disclaimer">
          {isEn
            ? 'Accounts and passwords are saved on the backend server (bcrypt encrypted).'
            : 'Tài khoản và mật khẩu được lưu trên máy chủ backend (mã hoá bcrypt).'}
        </p>
      </div>
    </div>
  )
}
