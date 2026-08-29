import { CheckIcon } from '../Icons'
import { getPlan } from '../../data/account'

// Tab "Gói thuê bao": hiển thị các gói và nút chuyển đổi.
export default function SubscriptionTab({ account, lang, isEn, availablePlans, onSelectPlan }) {
  return (
    <section>
      <h2>{isEn ? 'Subscription Plans' : 'Gói thuê bao'}</h2>
      <div className="plans-grid">
        {availablePlans.map((pRaw) => {
          const p = getPlan(pRaw.id, lang, availablePlans)
          const isCurrent = p.id === account.planId
          return (
            <div key={p.id} className={`plan-card ${isCurrent ? 'plan-card--current' : ''}`}>
              {isCurrent && <span className="plan-card__badge">{isEn ? 'Active Plan' : 'Đang sử dụng'}</span>}
              <h3>{p.name}</h3>
              <p className="plan-card__price">
                {p.price}
                <span>{p.priceDetail}</span>
              </p>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <CheckIcon /> {f}
                  </li>
                ))}
              </ul>
              <button
                className={`btn ${isCurrent || (p.id === 'free' && account.planId === 'pro') ? 'btn--outline' : 'btn--primary'}`}
                disabled={isCurrent || (p.id === 'free' && account.planId === 'pro')}
                onClick={() => onSelectPlan(p.id)}
              >
                {isCurrent ? (isEn ? 'Active Plan' : 'Gói hiện tại') : (p.id === 'free' && account.planId === 'pro' ? (isEn ? 'Basic Plan' : 'Gói cơ bản') : (isEn ? `Upgrade to ${p.name}` : `Chuyển sang ${p.name}`))}
              </button>
            </div>
          )
        })}
      </div>
      <p className="settings-modal__hint">
        {isEn ? 'Flexible plan switching between Free and Pro Medical AI.' : 'Chuyển đổi gói trải nghiệm linh hoạt giữa gói Miễn phí và Pro y tế cao cấp.'}
      </p>
    </section>
  )
}
