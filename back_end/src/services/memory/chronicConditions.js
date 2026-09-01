import { UserMemoryModel } from '../../db/user_memory.model.js'

// Maps free-text chronic_condition memories to the canonical condition IDs
// the nutrition microservice's clinical rules understand. Mirrors the
// keyword lists in nutrition_service/src/core/constants.py so both sides
// stay consistent. CKD_DIALYSIS wins over CKD_NON_DIALYSIS: a dialysis
// patient's diet protocol replaces the non-dialysis one.
const CONDITION_KEYWORDS = [
  ['DIABETES', ['tieu duong', 'dai thao duong', 'duong huyet', 'diabetes', 'type 2', 'duong mau']],
  ['HYPERTENSION', ['huyet ap', 'tang huyet ap', 'cao huyet ap', 'tim mach', 'hypertension', 'mach vanh']],
  ['GOUT', ['gut', 'gout', 'acid uric', 'axit uric', 'sung ngon chan', 'viem khop gut']],
  ['CKD_DIALYSIS', ['loc mau', 'chay than', 'tham phan', 'than nhan tao']],
  ['CKD_NON_DIALYSIS', ['suy than', 'than man', 'than', 'ckd', 'creatinine', 'egfr', 'chua loc mau']],
  ['DYSLIPIDEMIA', ['mo mau', 'roi loan lipid', 'cholesterol', 'triglyceride', 'gan nhiem mo', 'xo vua']],
]

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
}

// Match theo word boundary — sau khi normalize bỏ dấu, các keyword ngắn như
// 'than' (thận) dễ khớp nhầm từ chứa nó ("6 tháng", "thăng bằng"...).
const COMPILED_KEYWORDS = CONDITION_KEYWORDS.map(([id, keywords]) => [
  id,
  keywords.map((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)),
])

// Resolves the user's active chronic conditions from the Personal Memory
// profile. Only confirmed, self-reported facts are considered so conditions
// the user merely asked about ("nếu tôi bị tiểu đường") are not injected.
export async function getChronicConditionIds(userId, limit = 50) {
  if (!userId) return []

  const memories = await UserMemoryModel.find({
    userId,
    category: 'chronic_condition',
    status: 'active',
    subject: 'self',
    medicalStatus: 'confirmed',
  })
    .sort({ extractedAt: -1 })
    .limit(limit)
    .lean()

  const ids = []
  let dialysis = false
  for (const memory of memories) {
    const text = normalize(memory.content)
    if (!text) continue
    for (const [id, patterns] of COMPILED_KEYWORDS) {
      if (!patterns.some((p) => p.test(text))) continue
      if (id === 'CKD_DIALYSIS') dialysis = true
      if (id === 'CKD_NON_DIALYSIS' && dialysis) continue
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids
}
