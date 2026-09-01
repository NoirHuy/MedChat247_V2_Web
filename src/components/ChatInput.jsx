import { useEffect, useRef } from 'react'
import { PaperclipIcon, MicIcon, SendIcon, StopIcon } from './Icons'
import SpecialtyPicker from './SpecialtyPicker'
import { SPECIALTIES, NUTRITION_SPECIALTY_ID } from '../data/specialties'
import './ChatInput.css'

export default function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isResponding,
  specialtyId,
  onSpecialtyChange,
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
