import { useEffect, useRef, useState } from 'react'
import { CloseIcon, UserCircleIcon, GaugeIcon, CreditCardIcon, HelpCircleIcon, SparklesIcon, BrainIcon } from './Icons'
import { PLANS, getPlan, PRO_PRICE_LABEL, PRO_DURATION_LABEL } from '../data/account'
import { apiRequest } from '../services/api'
import AccountTab from './settings/AccountTab'
import MemoryTab from './settings/MemoryTab'
import UsageTab from './settings/UsageTab'
import SubscriptionTab from './settings/SubscriptionTab'
import PaymentTab from './settings/PaymentTab'
import HelpTab from './settings/HelpTab'
import './SettingsModal.css'

export default function SettingsModal({
  activeTab,
  onClose,
  onChangeTab,
  account,
  onUpdateName,
  onChangePassword,
  onToggleAutoRenew,
  onSetPlan,
  onUpdateAccount,
  onRefetchAccount,
  onSignOut,
  onDeleteAccount,
  onFetchUsage,
  onFetchPlans,
  showToast,
  lang = 'vi',
}) {
  const isEn = lang === 'en'

  const TABS = [
    { id: 'account', label: isEn ? 'Account' : 'Tài khoản', Icon: UserCircleIcon },
    { id: 'memory', label: isEn ? 'Personal Memory' : 'Trí nhớ cá nhân', Icon: BrainIcon },
    { id: 'usage', label: isEn ? 'Usage Stats' : 'Mức sử dụng', Icon: GaugeIcon },
    { id: 'subscription', label: isEn ? 'Subscription' : 'Gói thuê bao', Icon: SparklesIcon },
    { id: 'payment', label: isEn ? 'Payment' : 'Thanh toán', Icon: CreditCardIcon },
    { id: 'help', label: isEn ? 'Help & Support' : 'Trợ giúp & Phản hồi', Icon: HelpCircleIcon },
  ]

  const [availablePlans, setAvailablePlans] = useState(PLANS)

  // State cho Nâng Cấp Gói & Thanh Toán PayPal
  const [confirmPaymentModal, setConfirmPaymentModal] = useState(false)
  const [paypalConfig, setPaypalConfig] = useState(null)
  const [paypalSdkLoaded, setPaypalSdkLoaded] = useState(false)
  // Refs tới hai vị trí có thể chứa nút PayPal (tab thanh toán & modal xác nhận).
  const paypalMainRef = useRef(null)
  const paypalConfirmRef = useRef(null)

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const fetchFn = onFetchPlans || (() => apiRequest('/api/account/plans'))
    fetchFn()
      .then((data) => {
        if (!cancelled && Array.isArray(data?.plans) && data.plans.length > 0) {
          setAvailablePlans(data.plans)
        }
      })
      .catch((err) => console.error('[Plans] Load failed:', err))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when modal mounts
  }, [])

  // ─── PAYPAL: config → SDK → smart buttons ──────────────────────────────────
  useEffect(() => {
    if ((activeTab !== 'payment' && !confirmPaymentModal) || paypalConfig) return
    apiRequest('/api/payments/config')
      .then((cfg) => setPaypalConfig(cfg))
      .catch((err) => console.error('[PayPal Config] Error loading config:', err))
  }, [activeTab, confirmPaymentModal, paypalConfig])

  // Load PayPal SDK script dynamically when PayPal config is ready
  useEffect(() => {
    if (!paypalConfig?.clientId || paypalSdkLoaded) return
    const scriptId = 'paypal-js-sdk'
    if (document.getElementById(scriptId)) {
      setPaypalSdkLoaded(true)
      return
    }
    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://www.paypal.com/sdk/js?client-id=${paypalConfig.clientId}&currency=USD`
    script.async = true
    script.onload = () => setPaypalSdkLoaded(true)
    script.onerror = () => console.error('[PayPal SDK] Failed to load SDK script.')
    document.body.appendChild(script)
  }, [paypalConfig, paypalSdkLoaded])

  // Render PayPal Smart Buttons into whichever container is currently visible
  // (confirm modal takes priority over the payment tab).
  useEffect(() => {
    if (!paypalSdkLoaded || !window.paypal) return

    const container = confirmPaymentModal ? paypalConfirmRef.current : paypalMainRef.current
    if (!container || container.childElementCount > 0) return

    try {
      window.paypal.Buttons({
        style: {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: 'paypal',
        },
        createOrder: async () => {
          const res = await apiRequest('/api/payments/paypal/create-order', { method: 'POST' })
          return res.orderId
        },
        onApprove: async (data) => {
          try {
            const res = await apiRequest('/api/payments/paypal/capture-order', {
              method: 'POST',
              body: JSON.stringify({ orderId: data.orderID }),
            })
            showToast?.(res.message || (isEn ? 'PayPal payment successful!' : 'Thanh toán PayPal thành công!'))
            setConfirmPaymentModal(false)

            if (onRefetchAccount) {
              await onRefetchAccount()
            }
            if (res.user) {
              onUpdateAccount?.(res.user)
            }
          } catch (err) {
            showToast?.(err.message || (isEn ? 'Could not complete PayPal payment.' : 'Không thể hoàn tất thanh toán PayPal.'))
          }
        },
        onError: (err) => {
          console.error('[PayPal Error]', err)
          showToast?.(isEn ? 'An error occurred during PayPal payment.' : 'Xảy ra lỗi trong quá trình thanh toán PayPal.')
        },
      }).render(container)
    } catch (e) {
      console.error('[PayPal Render Error]', e)
    }
  }, [paypalSdkLoaded, activeTab, confirmPaymentModal, showToast, isEn, onUpdateAccount, onRefetchAccount])

  // Xử lý bấm Chuyển Gói
  function handleSelectPlanClick(targetPlanId) {
    if (targetPlanId === account.planId) return
    if (targetPlanId === 'pro') {
      setConfirmPaymentModal(true)
    } else {
      const confirmMsg = isEn ? 'Are you sure you want to switch to the Free plan?' : 'Bạn có chắc chắn muốn chuyển về gói Miễn phí?'
      if (window.confirm(confirmMsg)) {
        processPlanChange('free')
      }
    }
  }

  // Tiến hành gọi API đổi gói (dành cho gói Free). App.handleSetPlan đã tự
  // hiển thị toast kết quả nên ở đây chỉ xử lý lỗi.
  async function processPlanChange(planId) {
    try {
      await onSetPlan(planId)
      setConfirmPaymentModal(false)
    } catch (err) {
      showToast?.(err.message || (isEn ? 'Could not change plan.' : 'Không thể thay đổi gói.'))
    }
  }

  if (!activeTab || !account) return null

  const plan = getPlan(account.planId, lang, availablePlans)
  const isAutoRenewOn = account.autoRenew !== false

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="settings-modal__close" onClick={onClose} aria-label={isEn ? 'Close' : 'Đóng'}>
          <CloseIcon />
        </button>

        <nav className="settings-modal__tabs">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`settings-modal__tab ${id === activeTab ? 'settings-modal__tab--active' : ''}`}
              onClick={() => onChangeTab(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-modal__content">
          {activeTab === 'account' && (
            <AccountTab
              account={account}
              isEn={isEn}
              onUpdateName={onUpdateName}
              onChangePassword={onChangePassword}
              onSignOut={onSignOut}
              onDeleteAccount={onDeleteAccount}
              showToast={showToast}
              onClose={onClose}
            />
          )}

          {activeTab === 'memory' && (
            <MemoryTab isEn={isEn} showToast={showToast} />
          )}

          {activeTab === 'usage' && (
            <UsageTab plan={plan} isEn={isEn} onFetchUsage={onFetchUsage} />
          )}

          {activeTab === 'subscription' && (
            <SubscriptionTab
              account={account}
              lang={lang}
              isEn={isEn}
              availablePlans={availablePlans}
              onSelectPlan={handleSelectPlanClick}
            />
          )}

          {activeTab === 'payment' && (
            <PaymentTab
              account={account}
              isEn={isEn}
              isAutoRenewOn={isAutoRenewOn}
              onToggleAutoRenew={onToggleAutoRenew}
              paypalSdkLoaded={paypalSdkLoaded}
              paypalMainRef={paypalMainRef}
            />
          )}

          {activeTab === 'help' && (
            <HelpTab isEn={isEn} isLoggedIn={!!account?.id} showToast={showToast} />
          )}
        </div>
      </div>

      {/* MODAL XÁC NHẬN THANH TOÁN PAYPAL NÂNG CẤP PRO */}
      {confirmPaymentModal && (
        <div className="modal-backdrop modal-backdrop--nested" onClick={() => setConfirmPaymentModal(false)}>
          <div className="confirm-payment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-payment-header">
              <SparklesIcon />
              <h3>{isEn ? 'Upgrade to Pro Specialist (PayPal)' : 'Nâng cấp gói Pro Chuyên Gia (PayPal)'}</h3>
            </div>
            <p className="confirm-payment-desc">
              {isEn
                ? `Complete payment of ${PRO_PRICE_LABEL.en} via PayPal for ${PRO_DURATION_LABEL.en} of Pro features:`
                : `Hoàn tất thanh toán ${PRO_PRICE_LABEL.vi} qua cổng PayPal để nâng cấp ${PRO_DURATION_LABEL.vi} sử dụng gói Pro Chuyên Gia:`
              }
            </p>
            <div style={{ padding: '16px 0', minHeight: '120px' }}>
              <div ref={paypalConfirmRef} />
            </div>
            <div className="confirm-modal-actions">
              <button
                className="btn btn--outline"
                onClick={() => setConfirmPaymentModal(false)}
              >
                {isEn ? 'Cancel' : 'Hủy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
