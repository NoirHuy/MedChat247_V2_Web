import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import DashboardView from './components/DashboardView'
import SettingsModal from './components/SettingsModal'
import AuthModal from './components/AuthModal'
import Toast from './components/Toast'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'
import { useAccount } from './hooks/useAccount'
import { useToast } from './hooks/useToast'
import { SPECIALTIES, DEFAULT_SPECIALTY_ID } from './data/specialties'
import LegalPage from './components/LegalPage'
import './App.css'

const SPECIALTY_STORAGE_KEY = 'medai_specialty'

function loadStoredSpecialty() {
  try {
    const stored = localStorage.getItem(SPECIALTY_STORAGE_KEY)
    return SPECIALTIES.some((s) => s.id === stored) ? stored : DEFAULT_SPECIALTY_ID
  } catch {
    return DEFAULT_SPECIALTY_ID
  }
}

function App() {
  const legalPath = window.location.pathname
  if (legalPath === '/privacy-policy' || legalPath === '/terms') {
    return <LegalPage type={legalPath === '/terms' ? 'terms' : 'privacy'} />
  }
  return <AppContent />
}

function AppContent() {
  const {
    account,
    signUpForm,
    verifySignUpEmail,
    requestPasswordReset,
    confirmPasswordReset,
    signInForm,
    signInWithGoogle,
    updateName,
    changePassword,
    toggleAutoRenew,
    setPlan,
    updateAccountUser,
    deleteAccount,
    refetchAccount,
    signOut,
    fetchUsage,
    fetchPlans,
  } = useAccount()
  const chat = useChat(account)
  const { theme, toggleTheme } = useTheme()
  const { message: toastMessage, showToast } = useToast()

  const [inputValue, setInputValue] = useState('')
  const [pendingSpecialtyId, setPendingSpecialtyId] = useState(loadStoredSpecialty)
  const [searchTerm, setSearchTerm] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [view, setView] = useState('chat')
  const [settingsTab, setSettingsTab] = useState(null)
  const [authTab, setAuthTab] = useState(null)
  const [lang, setLang] = useState(localStorage.getItem('medai_lang') || 'vi')

  const isAdminPath = window.location.pathname === '/admin' || window.location.pathname === '/admin/'

  // Tự động chuyển view nếu truy cập trực tiếp đường dẫn /admin
  useEffect(() => {
    if (isAdminPath && account?.role === 'admin' && view !== 'dashboard') {
      setView('dashboard')
    } else if (isAdminPath && account === null && !authTab) {
      // account === null nghĩa là đã xác nhận khách (undefined = đang loading),
      // tránh nhảy modal đăng nhập trong lúc /api/auth/me chưa trả về.
      setAuthTab('signin')
    }
  }, [isAdminPath, account, authTab, view])

  useEffect(() => {
    // Nếu người dùng không phải admin cố tình truy cập vào trang dashboard
    if (account && account.role !== 'admin' && (view === 'dashboard' || isAdminPath)) {
      setView('chat')
      showToast(lang === 'en' ? 'Unauthorized: Admin access only' : 'Bạn không có quyền truy cập trang quản trị.')
      if (window.location.pathname.startsWith('/admin')) {
        window.history.replaceState({}, '', '/')
      }
    }
  }, [account, view, lang, isAdminPath, showToast])

  useEffect(() => {
    const handleOpenAuth = (e) => {
      const tab = e.detail === 'signin' ? 'signin' : 'signup'
      setAuthTab(tab)
    }
    window.addEventListener('open-auth-modal', handleOpenAuth)
    return () => window.removeEventListener('open-auth-modal', handleOpenAuth)
  }, [])

  const specialtyId = chat.activeConversation?.specialtyId ?? pendingSpecialtyId

  function handleToggleLang() {
    const nextLang = lang === 'en' ? 'vi' : 'en'
    setLang(nextLang)
    localStorage.setItem('medai_lang', nextLang)
    showToast(nextLang === 'en' ? 'Language switched to English' : 'Đã chuyển sang Tiếng Việt')
  }

  function handleSpecialtyChange(newId) {
    // Nhớ chuyên khoa người dùng chọn — tạo cuộc trò chuyện mới hoặc reload
    // trang sẽ giữ nguyên giao diện chuyên khoa đó.
    setPendingSpecialtyId(newId)
    try {
      localStorage.setItem(SPECIALTY_STORAGE_KEY, newId)
    } catch {
      /* localStorage đầy hoặc bị chặn — bỏ qua, không chặn đổi chuyên khoa */
    }
    if (chat.activeConversation) {
      chat.setSpecialty(chat.activeConversation.id, newId)
    }
  }

  function handleSend(text, suggestionId = null) {
    const toSend = (text ?? '').trim() || inputValue.trim()
    if (!toSend || chat.isResponding) return
    setInputValue('')
    chat.sendMessage(toSend, specialtyId, lang, suggestionId)
  }

  function handleNewChat() {
    chat.startNewConversation(pendingSpecialtyId)
    setMobileOpen(false)
  }

  function handleSelectConversation(id) {
    chat.selectConversation(id)
    setMobileOpen(false)
  }

  async function handleUpdateName(name) {
    try {
      await updateName(name)
      showToast(lang === 'en' ? 'Profile changes saved' : 'Đã lưu thay đổi hồ sơ')
    } catch (err) {
      showToast(err.message)
    }
  }

  async function handleSetPlan(planId) {
    try {
      await setPlan(planId)
      setSettingsTab(null)
      if (planId === 'pro') {
        showToast(lang === 'en' ? 'Upgraded to Pro (simulated) — payment gateway not connected' : 'Đã nâng cấp lên Pro (giả lập) — chưa kết nối cổng thanh toán thật')
      } else {
        showToast(lang === 'en' ? 'Downgraded to Free plan (simulated)' : 'Đã chuyển về gói Free (giả lập)')
      }
    } catch (err) {
      showToast(err.message)
    }
  }

  function handleSignOut() {
    signOut()
    setView('chat')
    setMobileOpen(false)
    showToast(lang === 'en' ? 'Logged out' : 'Đã đăng xuất')
  }

  function handleHelp() {
    if (account) {
      setSettingsTab('help')
    } else {
      setAuthTab('signin')
    }
  }

  function handleAuthed(_user, message) {
    setAuthTab(null)
    showToast(message)
  }

  function handleDashboardBack() {
    window.history.replaceState({}, '', '/')
    setView('chat')
  }

  if (view === 'dashboard' && account) {
    return (
      <div className="app-shell-dashboard" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <DashboardView
          account={account}
          onBack={handleDashboardBack}
          onSignOut={handleSignOut}
          lang={lang}
        />
        <Toast message={toastMessage} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className={`sidebar-wrapper ${mobileOpen ? 'sidebar-wrapper--open' : ''}`}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          conversations={chat.conversations}
          activeId={chat.activeId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          onDelete={chat.deleteConversation}
          theme={theme}
          onToggleTheme={toggleTheme}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          account={account}
          onOpenSettings={setSettingsTab}
          onSignOut={handleSignOut}
          onHelp={handleHelp}
          onOpenAuth={() => setAuthTab('signin')}
          lang={lang}
        />
      </div>

      {mobileOpen && <div className="app-backdrop" onClick={() => setMobileOpen(false)} />}

      <ChatView
        messages={chat.activeConversation?.messages ?? []}
        isResponding={chat.isResponding}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSend={handleSend}
        onStop={chat.stopResponding}
        specialtyId={specialtyId}
        onSpecialtyChange={handleSpecialtyChange}
        onOpenMenu={() => setMobileOpen(true)}
        lang={lang}
        onToggleLang={handleToggleLang}
      />

      {settingsTab && account && (
        <SettingsModal
          activeTab={settingsTab}
          onChangeTab={setSettingsTab}
          onClose={() => setSettingsTab(null)}
          account={account}
          onUpdateName={handleUpdateName}
          onChangePassword={changePassword}
          onToggleAutoRenew={toggleAutoRenew}
          onSetPlan={handleSetPlan}
          onUpdateAccount={updateAccountUser}
          onRefetchAccount={refetchAccount}
          onSignOut={handleSignOut}
          onDeleteAccount={deleteAccount}
          onFetchUsage={fetchUsage}
          onFetchPlans={fetchPlans}
          showToast={showToast}
          lang={lang}
        />
      )}

      {authTab && (
        <AuthModal
          initialTab={authTab}
          lang={lang}
          onClose={() => {
            setAuthTab(null)
            if (isAdminPath) {
              window.history.replaceState({}, '', '/')
              setView('chat')
            }
          }}
          onSignUpForm={signUpForm}
          onVerifySignUpEmail={verifySignUpEmail}
          onRequestPasswordReset={requestPasswordReset}
          onConfirmPasswordReset={confirmPasswordReset}
          onSignInForm={signInForm}
          onSignInWithGoogle={signInWithGoogle}
          onAuthed={handleAuthed}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  )
}

export default App
