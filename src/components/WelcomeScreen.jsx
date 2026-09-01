import { getSuggestions } from '../data/suggestions'
import { PulseIcon } from './Icons'
import './WelcomeScreen.css'

export default function WelcomeScreen({ onPick, specialtyId, lang = 'vi' }) {
  const isEn = lang === 'en'
  const isNutrition = specialtyId === 'nutrition_consultation'
  const isGeneral = specialtyId === 'general_consultation'
  const currentSuggestions = getSuggestions(specialtyId)

  return (
    <div className="welcome">
      <div className="welcome__icon-wrapper">
        <PulseIcon className="welcome__icon" />
      </div>

      <h1 className="welcome__title">
        {isNutrition ? (
          isEn ? (
            <>What nutrition & dietary questions can <span className="welcome__title-gradient">MedChat247</span> explore for you today?</>
          ) : (
            <>Bạn cần tư vấn dinh dưỡng & thực đơn món ăn cùng <span className="welcome__title-gradient">MedChat247</span> không?</>
          )
        ) : isGeneral ? (
          isEn ? (
            <>What medical & clinical questions can <span className="welcome__title-gradient">MedChat247</span> explore for you today?</>
          ) : (
            <>Bạn có thắc mắc y khoa & bệnh học nào muốn tư vấn cùng <span className="welcome__title-gradient">MedChat247</span> không?</>
          )
        ) : (
          isEn ? (
            <>What health questions can <span className="welcome__title-gradient">MedChat247</span> explore for you today?</>
          ) : (
            <>Bạn có thắc mắc sức khỏe nào muốn tìm hiểu cùng <span className="welcome__title-gradient">MedChat247</span> không?</>
          )
        )}
      </h1>

      <p className="welcome__subtitle">
        {isNutrition ? (
          isEn
            ? "Ask about any dish, ingredients, chronic disease diets, or select a prompt below."
            : "Hỏi về bất kỳ món ăn, nguyên liệu, thực đơn bệnh mạn tính nào — hoặc chọn gợi ý bên dưới."
        ) : isGeneral ? (
          isEn
            ? "Explore clinical consultations, disease pathophysiology, pharmacology, or select a prompt below."
            : "Tư vấn lâm sàng, bệnh học, dược lý và định hướng điều trị tổng quát — hoặc chọn gợi ý bên dưới."
        ) : (
          isEn
            ? "Describe symptoms or ask any medical question — or select a prompt below."
            : "Mô tả triệu chứng hoặc đặt bất kỳ câu hỏi y tế nào — hoặc chọn gợi ý bên dưới."
        )}
      </p>

      <div className="welcome__grid">
        {currentSuggestions.map((s) => {
          const title = typeof s.title === 'object' ? (s.title[lang] || s.title.vi) : s.title
          const detail = typeof s.detail === 'object' ? (s.detail[lang] || s.detail.vi) : s.detail
          const prompt = typeof s.prompt === 'object' ? (s.prompt[lang] || s.prompt.vi) : s.prompt
          return (
            <button key={s.id || title} className="suggestion-chip" onClick={() => onPick(prompt, s.id)}>
              <span className="suggestion-chip__title">{title}</span>
              <span className="suggestion-chip__detail">{detail}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
