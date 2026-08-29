import { useEffect, useRef } from 'react'
import { PaperclipIcon, MicIcon, SendIcon, StopIcon } from './Icons'
import SpecialtyPicker from './SpecialtyPicker'
import { SPECIALTIES, NUTRITION_SPECIALTY_ID } from '../data/specialties'
import './ChatInput.css'

const CHRONIC_CONDITIONS = [
  { id: 'DIABETES', label: { vi: 'Tiểu đường', en: 'Diabetes' }, icon: '🩺' },
  { id: 'HYPERTENSION', label: { vi: 'Tăng HA', en: 'Hypertension' }, icon: '🫀' },
  { id: 'GOUT', label: { vi: 'Gout', en: 'Gout' }, icon: '🦶' },
  { id: 'CKD_NON_DIALYSIS', label: { vi: 'Bệnh thận', en: 'Kidney Disease' }, icon: '🫘' },
  { id: 'DYSLIPIDEMIA', label: { vi: 'Mỡ máu', en: 'Dyslipidemia' }, icon: '🩸' },
]

export default function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isResponding,
  specialtyId,
  onSpecialtyChange,
  selectedConditions = [],
  onToggleCondition,
  lang = 'vi',
  isWelcome = false,
}) {
  const textareaRef = useRef(null)
  const isEn = lang === 'en'
  const isNutrition = specialtyId === NUTRITION_SPECIALTY_ID

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  function handleKeyDown(e) {
    // Enter during IME composition (Vietnamese Telex, etc.) confirms the
    // composition — it must not send the message.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!isResponding && value.trim()) onSend()
    }
  }

  return (
    <div className={`chat-input ${isWelcome ? 'chat-input--welcome' : ''}`}>
      {isNutrition && (
        <div className="nutrition-conditions-bar">
          <span className="nutrition-conditions-label">
            🧠 {isEn ? 'Health Profile:' : 'Bệnh lý nền của bạn:'}
          </span>
          <div className="nutrition-conditions-pills">
            {CHRONIC_CONDITIONS.map((c) => {
              const active = selectedConditions.includes(c.id)
              const name = c.label[lang] || c.label.vi
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`condition-pill ${active ? 'condition-pill--active' : ''}`}
                  onClick={() => onToggleCondition?.(c.id)}
                  title={active ? (isEn ? 'Click to remove' : 'Bấm để bỏ chọn') : (isEn ? 'Click to select' : 'Bấm để chọn')}
                >
                  <span className="condition-pill__icon">{c.icon}</span>
                  <span className="condition-pill__name">{name}</span>
                  {active && <span className="condition-pill__check">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="chat-input__box">
        <button
          type="button"
          className="chat-input__icon-btn"
          title={isEn ? "Attach file (coming soon)" : "Đính kèm tệp (sắp ra mắt)"}
          disabled
        >
          <PaperclipIcon />
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={
            isNutrition
              ? (isEn ? "Ask about food or nutrition..." : "Hỏi về món ăn, dinh dưỡng...")
              : (isEn ? "Type symptoms or medical questions..." : "Nhập triệu chứng hoặc câu hỏi y tế...")
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <SpecialtyPicker
          specialties={SPECIALTIES}
          value={specialtyId}
          onChange={onSpecialtyChange}
          direction="up"
          align="end"
          variant="pill"
          lang={lang}
        />
        <button
          type="button"
          className="chat-input__icon-btn"
          title={isEn ? "Voice input (coming soon)" : "Nhập bằng giọng nói (sắp ra mắt)"}
          disabled
        >
          <MicIcon />
        </button>
        {isResponding ? (
          <button
            type="button"
            className="chat-input__send chat-input__send--stop"
            onClick={onStop}
            title={isEn ? "Stop response" : "Dừng phản hồi"}
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            className="chat-input__send"
            onClick={onSend}
            disabled={!value.trim()}
            title={isEn ? "Send" : "Gửi"}
          >
            <SendIcon />
          </button>
        )}
      </div>
      <p className="chat-input__hint">
        {isEn
          ? "MedChat247 may provide inaccurate information. This is not official medical advice — consult a physician when necessary."
          : "MedChat247 có thể đưa ra thông tin chưa chính xác. Đây không phải lời khuyên y tế chính thức — hãy tham khảo bác sĩ khi cần."
        }
      </p>
    </div>
  )
}
