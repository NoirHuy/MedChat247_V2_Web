// A single demo Google account offered by the mocked account chooser in
// AuthModal — stands in for the real accounts Google's OAuth popup would list.
export const MOCK_GOOGLE_ACCOUNT = {
  name: 'Trần Thị Demo',
  email: 'demo.tran@gmail.com',
}

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: { vi: '0đ', en: '$0' },
    priceDetail: { vi: '/tháng', en: '/month' },
    tokenLimit: 500000000,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { vi: '99.000đ', en: '$3.99' },
    priceDetail: { vi: '/tháng', en: '/month' },
    tokenLimit: 2000000000,
    // Must mirror back_end/src/config/plans.js
    priceUsd: '$3.99',
    priceVnd: '99.000đ',
    durationDays: 30,
  },
]

// Shared Pro pricing copy so UI text never drifts from PLANS.
export const PRO_PRICE_LABEL = {
  vi: `${PLANS[1].priceVnd} (~${PLANS[1].priceUsd} USD)`,
  en: `${PLANS[1].priceUsd} (~${PLANS[1].priceVnd})`,
}
export const PRO_DURATION_LABEL = { vi: '30 ngày', en: '30 days' }

export function formatTokenLimit(limit, lang = 'vi') {
  const num = Number(limit || 0)
  const formatted = num.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')
  return lang === 'en' ? `${formatted} AI response tokens per month` : `${formatted} token phản hồi AI mỗi tháng`
}

export function getPlan(planId, lang = 'vi', customPlans = null) {
  const planList = customPlans || PLANS
  const p = planList.find((item) => item.id === planId) ?? planList[0]
  const defaultMeta = PLANS.find((item) => item.id === p.id) || PLANS[0]

  const tokenLimit = Number(p.tokenLimit ?? defaultMeta.tokenLimit ?? 0)
  const tokenFeature = formatTokenLimit(tokenLimit, lang)

  const isFree = p.id === 'free'
  const features = lang === 'en'
    ? [
        isFree ? 'Unlimited medical conversation turns' : 'All features included in Free plan',
        tokenFeature,
        ...(isFree ? ['Access to the initial medical screening specialty'] : ['Maximum AI response speed priority', 'Early access to new medical specialties']),
      ]
    : [
        isFree ? 'Tư vấn không giới hạn số cuộc trò chuyện' : 'Toàn bộ tính năng của gói Free',
        tokenFeature,
        ...(isFree ? ['Truy cập chuyên khoa sàng lọc y tế ban đầu'] : ['Ưu tiên tốc độ phản hồi tối đa', 'Truy cập sớm các chuyên khoa mới']),
      ]

  const priceObj = p.price ?? defaultMeta.price
  const priceDetailObj = p.priceDetail ?? defaultMeta.priceDetail

  return {
    ...defaultMeta,
    ...p,
    tokenLimit,
    price: typeof priceObj === 'object' ? (priceObj[lang] || priceObj.vi) : priceObj,
    priceDetail: typeof priceDetailObj === 'object' ? (priceDetailObj[lang] || priceDetailObj.vi) : priceDetailObj,
    features,
  }
}
