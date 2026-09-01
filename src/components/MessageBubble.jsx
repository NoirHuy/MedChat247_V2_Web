import { useState, memo } from 'react'
import { PulseIcon } from './Icons'
import TypingDots from './TypingDots'
import NutritionCard from './NutritionCard'
import './MessageBubble.css'

// The regexes below deliberately match malformed emoji sequences (variation
// selectors, zero-width chars, U+FFFD) emitted by LLM output, which triggers
// no-misleading-character-class even though matching combining sequences is
// exactly the goal.
/* eslint-disable eslint/no-misleading-character-class */

export default memo(function MessageBubble({ role, content, streaming, lang = 'vi', onSend, isLast }) {
  const isUser = role === 'user'
  const isEn = lang === 'en'

  // Kiểm tra và trích xuất danh sách hộp kiểm triệu chứng
  const checklistMatch = !isUser && content ? content.match(/\[SymptomChecklist:\s*(.*?)\]/) : null
  const hasChecklist = !!checklistMatch

  // Kiểm tra và trích xuất thông tin Trí nhớ được tham khảo
  const memoryMatch = !isUser && content ? content.match(/__MEMORIES_USED__:(.*)/) : null
  let memoriesUsed = []
  if (memoryMatch) {
    try {
      memoriesUsed = JSON.parse(memoryMatch[1].trim())
    } catch {}
  }

  // Thẻ dữ liệu dinh dưỡng (chuyên khoa nutrition_consultation) — content là
  // marker __NUTRITION_DATA__:{json} do Node gateway bọc từ Flask.
  const nutritionMatch = !isUser && content ? content.match(/__NUTRITION_DATA__:([\s\S]*)/) : null
  let nutritionData = null
  if (nutritionMatch) {
    try {
      nutritionData = JSON.parse(nutritionMatch[1].trim())
    } catch {
      console.warn('Failed to parse nutrition data')
    }
  }

  const [checkedIds, setCheckedIds] = useState([])
  const [submitted, setSubmitted] = useState(false)

  let cleanContent = content
  if (memoryMatch) {
    cleanContent = cleanContent.replace(/__MEMORIES_USED__:(.*)/g, '').trim()
  }
  if (nutritionMatch) {
    cleanContent = cleanContent.replace(/__NUTRITION_DATA__:[\s\S]*/g, '').trim()
  }

  let checklistItems = []

  if (hasChecklist) {
    cleanContent = cleanContent.replace(/\[SymptomChecklist:\s*(.*?)\]/g, '').trim()
    checklistItems = checklistMatch[1].split(',').map(item => {
      const parts = item.split('=')
      return {
        id: parts[0]?.trim(),
        name: parts[1]?.trim() || parts[0]?.trim()
      }
    }).filter(item => item.id)
  }

  return (
    <div className={`message-row ${isUser ? 'message-row--user' : 'message-row--assistant'}`}>
      {!isUser && (
        <div className="message-avatar">
          <PulseIcon />
        </div>
      )}
      <div className="message-col">
        <div
          className={`message-bubble ${isUser ? 'message-bubble--user' : 'message-bubble--assistant'}`}
        >
          {nutritionData ? (
            <NutritionCard data={nutritionData} lang={lang} onSend={onSend} />
          ) : cleanContent ? (
            isUser ? (
              <p className="msg-user-content">{renderInline(cleanContent, 'user-msg')}</p>
            ) : (
              renderMessageContent(cleanContent)
            )
          ) : streaming ? (
            <TypingDots />
          ) : null}
          {streaming && !nutritionData && cleanContent && <span className="message-cursor" />}

          {memoriesUsed && memoriesUsed.length > 0 && !streaming && (
            <div className="memory-referenced-badge">
              {isEn
                ? `🧠 Referenced your personal clinical profile (${memoriesUsed.length} item${memoriesUsed.length > 1 ? 's' : ''})`
                : `🧠 Đã tham khảo hồ sơ trí nhớ cá nhân của bạn (${memoriesUsed.length} mục)`}
            </div>
          )}

          {hasChecklist && !streaming && (
            <div className="symptom-checklist-box">
              <p className="symptom-checklist-title">
                {isEn
                  ? "To help differentiate more accurately, please select the symptoms below that you are experiencing so I have enough information to evaluate:"
                  : "Để giúp phân biệt chính xác hơn, bạn vui lòng tích chọn các triệu chứng dưới đây mà bạn đang gặp phải để tôi có đủ thông tin đánh giá:"
                }
              </p>
              <div className="symptom-checklist-grid">
                {checklistItems.map(item => (
                  <label
                    key={item.id}
                    className={`symptom-checkbox-label ${checkedIds.includes(item.id) ? 'symptom-checkbox-label--checked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="symptom-checkbox-input"
                      disabled={!isLast || submitted}
                      checked={checkedIds.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCheckedIds([...checkedIds, item.id])
                        } else {
                          setCheckedIds(checkedIds.filter(id => id !== item.id))
                        }
                      }}
                    />
                    <span className="checkbox-custom-label">{item.name}</span>
                  </label>
                ))}
              </div>
              {isLast && !submitted && (
                <button
                  type="button"
                  className="symptom-checklist-submit-btn"
                  onClick={() => {
                    setSubmitted(true)
                    const present = checklistItems.filter(item => checkedIds.includes(item.id)).map(item => item.name)
                    const absent = checklistItems.filter(item => !checkedIds.includes(item.id)).map(item => item.name)
                    
                    let text = ""
                    if (isEn) {
                      text = `I have the following symptoms: ${present.join(', ') || 'none'}. I do not have: ${absent.join(', ') || 'none'}.`
                    } else {
                      text = `Tôi có các triệu chứng: ${present.join(', ') || 'không có'}. Tôi không bị: ${absent.join(', ') || 'không có'}.`
                    }
                    onSend?.(text)
                  }}
                >
                  {isEn ? "Confirm & Send" : "Xác nhận và Gửi"}
                </button>
              )}
            </div>
          )}
        </div>
        {!isUser && content && !streaming && (
          <p className="message-disclaimer">
            {isEn
              ? "AI may make mistakes. Please consult a doctor if necessary."
              : "AI có thể mắc sai sót. Hãy tham khảo bác sĩ khi cần thiết."
            }
          </p>
        )}
      </div>
    </div>
  )
})

// ─── MAIN RENDERER ───────────────────────────────────────────────────────────
function renderMessageContent(text) {
  // Chia text theo dòng và gom thành các block có ngữ nghĩa
  const lines = text.split('\n')
  const blocks = []
  let buffer = []

  const flushBuffer = () => {
    if (buffer.length > 0) {
      blocks.push({ type: 'paragraph', lines: [...buffer] })
      buffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Heading: # ## ### ####
    if (/^#{1,4}\s/.test(trimmed)) {
      flushBuffer()
      const level = trimmed.match(/^(#{1,4})\s/)[1].length
      blocks.push({ type: 'heading', level, text: trimmed.replace(/^#{1,4}\s/, '') })
      continue
    }

    // Alert block: lines starting with ⚠️ Cảnh báo or ⚠️ Emergency Warning → warning, 💡/ℹ️ → info, ✅ → success
    if (/^⚠️\s*(\*\*|\*)?(Cảnh báo|Emergency Warning|Alert)/i.test(trimmed) || /^(🔴|🚨)/.test(trimmed)) {
      flushBuffer()
      blocks.push({ type: 'alert', variant: 'danger', text: trimmed })
      continue
    }
    if (/^(💡|ℹ️)/.test(trimmed)) {
      flushBuffer()
      blocks.push({ type: 'alert', variant: 'info', text: trimmed })
      continue
    }
    if (/^(✅|🟢)/.test(trimmed)) {
      flushBuffer()
      blocks.push({ type: 'alert', variant: 'success', text: trimmed })
      continue
    }

    // Horizontal rule ---
    if (/^---+$/.test(trimmed)) {
      flushBuffer()
      blocks.push({ type: 'divider' })
      continue
    }

    // Empty line → flush paragraph buffer
    if (trimmed === '') {
      flushBuffer()
      continue
    }

    buffer.push(line)
  }
  flushBuffer()

  return blocks.map((block, i) => renderBlock(block, i))
}

function renderPercentCircle(percent) {
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percent / 100) * circumference

  // Xác định màu sắc tương ứng với mức độ nguy cơ (%)
  let color = '#1a73e8' // Blue (Thấp)
  if (percent >= 60) {
    color = '#ea4335' // Red (Cao)
  } else if (percent >= 30) {
    color = '#f9ab00' // Yellow/Orange (Trung bình)
  } else {
    color = '#34a853' // Green (Rất thấp / An toàn)
  }

  return (
    <div className="disease-pct-circle-wrapper">
      <svg className="disease-pct-svg" width="36" height="36">
        <circle
          className="disease-pct-bg"
          cx="18"
          cy="18"
          r={radius}
          stroke="var(--border-subtle)"
          strokeWidth="3"
          fill="transparent"
        />
        <circle
          className="disease-pct-fg"
          cx="18"
          cy="18"
          r={radius}
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          transform="rotate(-90 18 18)"
        />
        <text
          x="18"
          y="22"
          textAnchor="middle"
          fontSize="10"
          fontWeight="bold"
          fill="var(--text-primary)"
        >
          {percent}%
        </text>
      </svg>
    </div>
  )
}

function renderBlock(block, key) {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level <= 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4'
      const cls = `msg-heading msg-heading--${block.level}`
      return <Tag key={key} className={cls}>{renderInline(block.text, `${key}`)}</Tag>
    }

    case 'alert': {
      return (
        <div key={key} className={`msg-alert msg-alert--${block.variant}`}>
          {renderInline(block.text, `${key}`)}
        </div>
      )
    }

    case 'divider':
      return <hr key={key} className="msg-divider" />

    case 'paragraph': {
      const lines = block.lines

      const isOrdered = lines.length > 1 && lines.every(l => /^\d+\.\s/.test(l.trim()))
      const isBulleted = lines.length > 1 && lines.every(l => /^[-*]\s/.test(l.trim()))

      // Phase 1: Danh sách câu hỏi làm rõ dạng gạch đầu dòng (Chỉ khi TẤT CẢ các mục đều chứa dấu hỏi ?)
      const allLinesAreQuestions = isBulleted && lines.every(l => {
        const content = l.trim().replace(/^[-*]\s/, '')
        return content.includes('?')
      })

      // Phase 1: Danh sách câu hỏi làm rõ dạng số thứ tự (Chỉ khi TẤT CẢ các mục đều chứa dấu hỏi ?)
      const allLinesAreOrderedQuestions = isOrdered && lines.every(l => {
        const content = l.trim().replace(/^\d+\.\s*/, '')
        return content.includes('?')
      })

      if (allLinesAreQuestions) {
        return (
          <div className="msg-question-cards-list" key={key}>
            {lines.map((line, i) => {
              const content = line.trim().replace(/^[-*]\s/, '')
              return (
                <div className="msg-question-card" key={i}>
                  <span className="msg-question-card__icon">❓</span>
                  <div className="msg-question-card__content">
                    {renderInline(content, `${key}-${i}`)}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }

      if (allLinesAreOrderedQuestions) {
        return (
          <div className="msg-question-cards-list" key={key}>
            {lines.map((line, i) => {
              const match = line.trim().match(/^(\d+)\.\s*(.*)/)
              const num = match ? match[1] : (i + 1)
              const content = match ? match[2] : line.trim()
              return (
                <div className="msg-question-card" key={i}>
                  <span className="msg-question-card__badge">{num}</span>
                  <div className="msg-question-card__content">
                    {renderInline(content, `${key}-${i}`)}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }

      // Phase 2: Báo cáo kết luận / Khuyến nghị hoặc Khối hỗn hợp
      return (
        <div key={key} className="msg-mixed-block">
          {lines.map((line, i) => {
            const trimmed = line.trim()
            const cleanLine = trimmed.replace(/[*#_`]/g, '').trim()

            // 1. Dòng tên bệnh kèm xác suất (Disease Header) - Song ngữ Việt & Anh
            const diseaseMatch = cleanLine.match(/^(\d+)\.\s*(.*?)(?::|\s+)?~?(\d+)%\s*(xác suất|khả năng|ước tính|probability|percent|chance|prob)?$/i) ||
                                 cleanLine.match(/^(\d+)\.\s*(.*?)\s*\((\d+)%\)/i)
            if (diseaseMatch) {
              const num = diseaseMatch[1]
              const name = diseaseMatch[2].replace(/:$/, '').trim()
              const percent = parseInt(diseaseMatch[3], 10)
              return (
                <div key={i} className="disease-item-header">
                  <span className="disease-num">{num}.</span>
                  <span className="disease-name">{name}</span>
                  {renderPercentCircle(percent)}
                </div>
              )
            }

            // 2. Dòng chi tiết (Chỉ khi thực sự có tiền tố gạch đầu dòng hoặc icon y tế tường minh)
            const hasIconPrefix = /^[\uFFFD\uFE0F\uFE0E\u200B\u00A0\s]*(📋|🔍|⚠️|🩺|💊|📌)/.test(trimmed)
            const isBulletLine = /^[\uFFFD\uFE0F\uFE0E\u200B\u00A0\s]*[-*•]\s+/.test(trimmed)

            if (hasIconPrefix || isBulletLine) {
              const cleanBullet = trimmed
                .replace(/^[-*•]\s*/, '')
                .replace(/^[\uFFFD\uFE0F\uFE0E\u200B\u00A0\s]*(📋|🔍|⚠️|🩺|💊|📌)[\uFFFD\uFE0F\uFE0E\u200B\u00A0\s]*/g, '')
                .replace(/^[\uFFFD\uFE0F\uFE0E\u200B\u00A0]+/, '')
                .trim()
              const lowerContent = cleanBullet.toLowerCase()
              const isEvidence = lowerContent.includes('dẫn chứng') || lowerContent.includes('bằng chứng') || lowerContent.includes('evidence')
              const isReasoning = lowerContent.includes('lý giải') || lowerContent.includes('differential') || lowerContent.includes('reasoning')
              const isWatch = lowerContent.includes('dấu hiệu') || lowerContent.includes('cảnh báo') || lowerContent.includes('watch for') || lowerContent.includes('warning')

              const isQuestion = cleanBullet.includes('?')

              // Nếu thực sự là câu hỏi lẻ ở Phase 1 (có dấu ?) -> Dùng Thẻ Question Card
              if (isQuestion && hasIconPrefix) {
                return (
                  <div key={i} className="msg-question-card">
                    <span className="msg-question-card__icon">❓</span>
                    <div className="msg-question-card__content">
                      {renderInline(cleanBullet, `${key}-${i}`)}
                    </div>
                  </div>
                )
              }

              // Nếu có icon rõ ràng
              if (hasIconPrefix) {
                let icon = '•'
                if (trimmed.includes('📋') || isEvidence) icon = '📋'
                else if (trimmed.includes('🔍') || isReasoning) icon = '🔍'
                else if (trimmed.includes('⚠️') || isWatch) icon = '⚠️'
                else if (trimmed.includes('🩺')) icon = '🩺'
                else if (trimmed.includes('💊')) icon = '💊'

                return (
                  <div key={i} className={`disease-detail-line ${isEvidence ? 'disease-detail-line--evidence' : ''}`}>
                    <span className="bullet-dot">{icon}</span>
                    <span className="detail-content">{renderInline(cleanBullet, `${key}-${i}`)}</span>
                  </div>
                )
              }

              // Dòng gạch đầu dòng chuẩn (-) hoặc (*)
              return (
                <div key={i} className="disease-detail-line">
                  <span className="bullet-dot">•</span>
                  <span className="detail-content">{renderInline(cleanBullet, `${key}-${i}`)}</span>
                </div>
              )
            }

            // 3. Dòng hướng dẫn dẫn dắt câu hỏi (Phase 1)
            if (trimmed.endsWith(':') && (trimmed.toLowerCase().includes('thông tin') || trimmed.toLowerCase().includes('câu hỏi') || trimmed.toLowerCase().includes('hiểu rõ') || trimmed.toLowerCase().includes('chia sẻ'))) {
              return (
                <div key={i} className="msg-intro-guidance">
                  <span className="msg-intro-guidance__icon">🩺</span>
                  <span className="msg-intro-guidance__text">{renderInline(line, `${key}-${i}`)}</span>
                </div>
              )
            }

            // Dòng văn bản bình thường
            return (
              <p key={i} className="detail-plain-line">
                {renderInline(line, `${key}-${i}`)}
              </p>
            )
          })}
        </div>
      )
    }

    default:
      return null
  }
}

// ─── INLINE RENDERER (bold, italic, code, links) ───────────────────────────
function renderInline(text, keyPrefix) {
  // 1. Lọc sạch mọi ký tự Unicode hỏng (\uFFFD), variation selectors đứng một mình (\uFE0F, \uFE0E) và zero-width spaces (\u200B)
  let sanitizedText = (text || '')
    .replace(/[\uFFFD\uFE0F\uFE0E\u200B]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()

  // 2. Tự động chuẩn hóa các lỗi cú pháp dấu sao markdown thường gặp từ LLM:
  // Ví dụ: *Lưu ý:** -> **Lưu ý:** hoặc **Lưu ý:* -> **Lưu ý:**
  sanitizedText = sanitizedText
    .replace(/\*([^*:\n]+):\*\*/g, '**$1:**')
    .replace(/\*\*([^*:\n]+):\*/g, '**$1:**')

  // 3. Tách chuỗi theo thứ tự ưu tiên: Link -> Bold-Italic (***) -> Bold (**) -> Italic (*) -> Italic (_) -> Inline Code (`)
  return sanitizedText
    .split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
    .filter(part => part.length > 0)
    .map((part, i) => {
      const k = `${keyPrefix}-${i}`

      // Bold + Italic / Triple Asterisks: ***text*** → Render as Bold only
      if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
        return <strong key={k}>{part.slice(3, -3)}</strong>
      }

      // Bold: **text** → Render as Bold
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return <strong key={k}>{part.slice(2, -2)}</strong>
      }

      // Single Asterisk / Italic marker: *text* → Strip asterisks, render as normal text (no italics)
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return <span key={k}>{part.slice(1, -1)}</span>
      }

      // Underscore Italic marker: _text_ → Strip underscores, render as normal text (no italics)
      if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
        return <span key={k}>{part.slice(1, -1)}</span>
      }

      // Inline code: `code`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return <code key={k} className="msg-code">{part.slice(1, -1)}</code>
      }

      // Markdown Link / Button: [Label](href)
      if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const match = part.match(/^\[(.*?)\]\((.*?)\)$/)
        if (match) {
          const label = match[1]
          const href = match[2]
          if (href.startsWith('#auth')) {
            const tab = href.includes('signin') ? 'signin' : 'signup'
            return (
              <button
                key={k}
                type="button"
                className="msg-auth-cta-link"
                onClick={() => window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: tab }))}
              >
                {label}
              </button>
            )
          }
          return (
            <a key={k} href={href} className="msg-inline-link" target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          )
        }
      }

      // Plain text: loại bỏ bất kỳ dấu sao trôi nổi không đóng mở nếu còn sót
      const cleanPlain = part.replace(/(?:^\*|\*$)/g, '')
      return <span key={k}>{cleanPlain}</span>
    })
}
