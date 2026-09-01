import './NutritionCard.css'

export default function NutritionCard({ data, onSend }) {
  if (!data) return null

  const foodName = data.food_name || data.ingredient_name || 'Món ăn'
  const category = data.category || ''
  const evalData = data.evaluation || {}
  const overall  = evalData.overall_status || 'SAFE'
  const alts     = data.alternatives || data.healthy_alternatives || []
  const llmNote  = data.llm_note || ''
  const allNutrients = data.all_nutrients || []

  const carbVal = data.carbohydrate_g ?? data.carb_g

  const fmt = (v, unit) =>
    v !== null && v !== undefined ? `${Number(v).toFixed(1)} ${unit}` : '—'

  const STATUS = {
    SAFE:     { cls: 'badge--safe',     label: 'AN TOÀN / KHUYÊN DÙNG' },
    MODERATE: { cls: 'badge--moderate', label: 'CẦN LƯU Ý / KIỂM SOÁT' },
    AVOID:    { cls: 'badge--avoid',    label: 'NÊN HẠN CHẾ / TRÁNH' },
  }
  const badge = STATUS[overall] || STATUS.SAFE

  // Danh sách các chất đã hiển thị ở tầng 1 & tầng 2 để tránh trùng lặp ở tầng chi tiết
  const EXCLUDED_FROM_DETAILS = new Set([
    'năng lượng', 'calo', 'energy',
    'chất đạm', 'protein', 'đạm',
    'chất béo', 'lipid', 'fat', 'béo',
    'chất bột đường', 'carbohydrate', 'carb',
    'natri', 'sodium',
    'kali', 'potassium',
    'cholesterol',
    'purine'
  ])

  // Lọc ra danh sách các vi chất còn lại (Vitamin, Khoáng chất vi lượng, Chất xơ...)
  const detailedNutrients = allNutrients.filter(n => {
    const nameNorm = (n.nutrient_name || '').trim().toLowerCase()
    return !EXCLUDED_FROM_DETAILS.has(nameNorm)
  })

  return (
    <div className="nc">
      {/* ── 1. HEADER ── */}
      <div className="nc__head">
        <div>
          {category && <div className="nc__cat">{category}</div>}
          <div className="nc__name">{foodName}</div>
        </div>
        <div className={`nc__badge ${badge.cls}`}>
          <span className="nc__badge-dot" />
          <span className="nc__badge-text">{badge.label}</span>
        </div>
      </div>

      {/* ── 2. TẦNG 1: 4 ĐẠI DƯỠNG CHẤT CHÍNH (TO RÕ Ở TRÊN) ── */}
      <div className="nc__macros">
        <div className="nc__macro">
          <div className="nc__macro-label">Năng lượng</div>
          <div className="nc__macro-val">{fmt(data.energy_kcal, 'kcal')}</div>
        </div>
        <div className="nc__macro">
          <div className="nc__macro-label">Chất đạm (Protein)</div>
          <div className="nc__macro-val">{fmt(data.protein_g, 'g')}</div>
        </div>
        <div className="nc__macro">
          <div className="nc__macro-label">Chất béo (Lipid)</div>
          <div className="nc__macro-val">{fmt(data.fat_g, 'g')}</div>
        </div>
        <div className="nc__macro">
          <div className="nc__macro-label">Chất bột đường (Carb)</div>
          <div className="nc__macro-val">{fmt(carbVal, 'g')}</div>
        </div>
      </div>

      {/* ── 3. TẦNG 2: KHOÁNG CHẤT & CHỈ SỐ LÂM SÀNG TRỌNG YẾU ── */}
      <div className="nc__micros">
        <div className="nc__micro-item">
          <span className="nc__micro-label">Natri:</span>
          <span className="nc__micro-val">{fmt(data.sodium_mg, 'mg')}</span>
        </div>
        <div className="nc__micro-item">
          <span className="nc__micro-label">Kali:</span>
          <span className="nc__micro-val">{fmt(data.potassium_mg, 'mg')}</span>
        </div>
        <div className="nc__micro-item">
          <span className="nc__micro-label">Cholesterol:</span>
          <span className="nc__micro-val">{fmt(data.cholesterol_mg, 'mg')}</span>
        </div>
        {data.purine_mg !== undefined && data.purine_mg !== null && (
          <div className="nc__micro-item">
            <span className="nc__micro-label">Purine:</span>
            <span className="nc__micro-val">{fmt(data.purine_mg, 'mg')}</span>
          </div>
        )}
      </div>

      {/* ── 4. TẦNG 3: TOÀN BỘ VI CHẤT & VITAMIN CHI TIẾT ── */}
      {detailedNutrients.length > 0 && (
        <div className="nc__details-section">
          <div className="nc__section-title">THÀNH PHẦN VI CHẤT & VITAMIN ({detailedNutrients.length})</div>
          <div className="nc__details-grid">
            {detailedNutrients.map((n, idx) => {
              const amtStr = typeof n.amount === 'number' ? Number(n.amount).toFixed(1) : (n.amount || '—')
              return (
                <div key={idx} className="nc__detail-row">
                  <span className="nc__detail-name">{n.nutrient_name}</span>
                  <span className="nc__detail-val">
                    {amtStr} <span className="nc__detail-unit">{n.unit || ''}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 5. LỜI KHUYÊN (TỪ LLM) ── */}
      {llmNote && (
        <div className="nc__note">
          <div className="nc__note-title">Lời Khuyên:</div>
          <div className="nc__note-body">{llmNote}</div>
        </div>
      )}

      {/* ── 6. ĐỀ XUẤT MÓN ĂN THAY THẾ ── */}
      {alts.length > 0 && (
        <div className="nc__alts">
          <div className="nc__alts-title">ĐỀ XUẤT MÓN ĂN TƯƠNG TỰ PHÙ HỢP HƠN</div>
          <div className="nc__alts-grid">
            {alts.slice(0, 3).map((alt, i) => {
              const name = alt.food_name || alt.name || ''
              const kcal = alt.energy_kcal != null ? `${alt.energy_kcal} kcal` : ''
              const na   = alt.sodium_mg   != null ? `${alt.sodium_mg} mg Na`  : (alt.sodium_level || 'Thấp mg Na')
              return (
                <div
                  key={i}
                  className="nc__alt"
                  onClick={() => onSend?.(`Tôi muốn đổi sang ăn ${name}, món này thế nào?`)}
                >
                  <div className="nc__alt-name">{name}</div>
                  <div className="nc__alt-meta">
                    {kcal && <span>{kcal}</span>}
                    {kcal && na && <span className="nc__dot">•</span>}
                    {na && <span>{na}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
