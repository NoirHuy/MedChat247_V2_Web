import { CreditCardIcon, CheckIcon } from '../Icons'
import { PRO_PRICE_LABEL, PRO_DURATION_LABEL } from '../../data/account'

// Tab "Thanh toán": trạng thái gói + công tắc gia hạn + khung chứa nút PayPal.
// SDK PayPal được load và render bởi SettingsModal (vì modal xác nhận thanh
// toán có thể mở từ tab Gói thuê bao).
export default function PaymentTab({ account, isEn, isAutoRenewOn, onToggleAutoRenew, paypalSdkLoaded, paypalMainRef }) {
  return (
    <section>
      <h2>{isEn ? 'Payment & PayPal Checkout' : 'Thanh toán & Cổng PayPal'}</h2>
      <p className="settings-modal__hint">
        {isEn ? `Secure international payment via PayPal Checkout to upgrade to Pro (${PRO_PRICE_LABEL.en} / ${PRO_DURATION_LABEL.en}).` : `Thanh toán an toàn quốc tế qua PayPal Checkout để nâng cấp gói Pro Chuyên Gia (${PRO_PRICE_LABEL.vi} / ${PRO_DURATION_LABEL.vi}).`}
      </p>

      {/* THÔNG TIN HẠN SỬ DỤNG GÓI */}
      <div className="subscription-status-box">
        <div className="status-header">
          <div>
            <span className="status-label">{isEn ? 'Subscription Status' : 'Trạng thái gói dịch vụ'}</span>
            <h3 className="status-title">
              {account.planId === 'pro' ? (isEn ? 'Pro Specialist (Active)' : 'Gói Pro Chuyên Gia (Active)') : (isEn ? 'Free Plan' : 'Gói Miễn Phí (Free)')}
            </h3>
          </div>
          <span className={`status-pill status-pill--${account.planId === 'pro' ? 'active' : 'free'}`}>
            {account.planId === 'pro' ? (isEn ? 'Active' : 'Đang hoạt động') : (isEn ? 'Free' : 'Miễn phí')}
          </span>
        </div>

        {account.planId === 'pro' && (
          <div className="date-info-grid">
            <div className="date-item">
              <span>{isEn ? 'Payment Method' : 'Phương thức thanh toán'}</span>
              <strong>PayPal ({account.billingDetails?.paypalEmail || (isEn ? 'PayPal Account' : 'Tài khoản PayPal')})</strong>
            </div>
            <div className="date-item">
              <span>{isEn ? 'Expiration Date' : 'Ngày hết hạn'}</span>
              <strong>{account.subscriptionExpiresAt ? new Date(account.subscriptionExpiresAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN') : (isEn ? `${PRO_DURATION_LABEL.en} from payment` : `${PRO_DURATION_LABEL.vi} kể từ ngày thanh toán`)}</strong>
            </div>
          </div>
        )}

        {/* CÔNG TẮC GIA HẠN TỰ ĐỘNG */}
        <div className="auto-renew-row">
          <div className="auto-renew-text">
            <strong>{isEn ? 'Auto-Renewal Reminders' : 'Tự động nhắc gia hạn'}</strong>
            <p className="auto-renew-hint">
              {isAutoRenewOn
                ? (isEn ? 'ACTIVE. System will remind you before your Pro plan expires.' : 'Đang BẬT. Hệ thống sẽ nhắc bạn gia hạn gói Pro khi sắp hết hạn.')
                : (isEn ? 'OFF. Pro plan will automatically revert to Free upon expiration.' : 'Đang TẮT. Gói Pro sẽ tự động chuyển về Miễn phí sau ngày hết hạn.')
              }
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isAutoRenewOn}
              onChange={(e) => onToggleAutoRenew?.(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="settings-divider" />

      {/* MỤC NÂNG CẤP QUA PAYPAL CHECKOUT */}
      <div className="settings-section-box">
        <h3 className="settings-subheading">
          <CreditCardIcon /> {isEn ? `Upgrade Pro via PayPal (${PRO_PRICE_LABEL.en})` : `Nâng cấp gói Pro bằng PayPal (${PRO_PRICE_LABEL.vi})`}
        </h3>

        {account.planId === 'pro' ? (
          <div className="settings-alert settings-alert--success" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckIcon />
            <div>
              <strong>{isEn ? 'Your account is on the Pro Plan!' : 'Tài khoản đang ở gói Pro Chuyên Gia!'}</strong>
              <p style={{ margin: 0, fontSize: '12px' }}>{isEn ? `You can renew for another ${PRO_DURATION_LABEL.en} at any time.` : `Bạn có thể thanh toán thêm lượt để gia hạn ${PRO_DURATION_LABEL.vi} tiếp theo bất kỳ lúc nào.`}</p>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: '16px' }}>
          {!paypalSdkLoaded && (
            <p className="settings-modal__hint" style={{ textAlign: 'center', padding: '12px' }}>
              {isEn ? 'Loading secure PayPal checkout gateway...' : 'Đang tải cổng thanh toán bảo mật PayPal...'}
            </p>
          )}
          <div ref={paypalMainRef} style={{ maxWidth: '400px', margin: '0 auto', minHeight: '120px' }} />
          <p className="settings-modal__hint" style={{ marginTop: '10px', textAlign: 'center', fontSize: '12px' }}>
            💡 <strong>{isEn ? 'Credit Card Tip (Visa/Mastercard):' : 'Mẹo khi thanh toán Thẻ (Visa/Mastercard):'}</strong> {isEn ? 'If PayPal asks for a ZIP code, enter 6 digits (e.g. 700000 or 100000).' : 'Nếu PayPal yêu cầu nhập Mã bưu chính (ZIP code), vui lòng điền 6 chữ số (Ví dụ: TP.HCM: 700000, Hà Nội: 100000).'}
          </p>
        </div>
      </div>
    </section>
  )
}
