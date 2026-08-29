import { useEffect, useRef } from 'react'
import { MenuIcon, AlertIcon } from './Icons'
import WelcomeScreen from './WelcomeScreen'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import './ChatView.css'

export default function ChatView({
  messages,
  isResponding,
  inputValue,
  onInputChange,
  onSend,
  onStop,
  specialtyId,
  onSpecialtyChange,
  selectedConditions,
  onToggleCondition,
  onOpenMenu,
  lang = 'vi',
  onToggleLang,
}) {
  const scrollRef = useRef(null)
  const shouldFollowStreamRef = useRef(true)
  const scrollFrameRef = useRef(null)
  const isEn = lang === 'en'

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !shouldFollowStreamRef.current) return
    cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages])

  useEffect(() => () => cancelAnimationFrame(scrollFrameRef.current), [])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    shouldFollowStreamRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const hasMessages = messages.length > 0

  return (
    <div className="chat-view">
      <button
        type="button"
        className="chat-view__mobile-menu-btn"
        onClick={onOpenMenu}
        aria-label={isEn ? "Open menu" : "Mở menu"}
      >
        <MenuIcon />
      </button>

      <button
        type="button"
        className="lang-single-btn"
        onClick={onToggleLang}
        title={isEn ? "Switch to Vietnamese" : "Switch to English"}
        aria-label="Toggle language"
      >
        {isEn ? "Vietnamese" : "English"}
      </button>

      <div className="chat-disclaimer">
        <AlertIcon />
        <span>
          {isEn
            ? "MedChat247 provides reference information only, and does not replace professional medical diagnosis or treatment."
            : "MedChat247 cung cấp thông tin tham khảo, không thay thế chẩn đoán hay điều trị của bác sĩ."
          }
        </span>
      </div>

      <div className="chat-body" ref={scrollRef} onScroll={handleScroll}>
        {hasMessages ? (
          <div className="chat-messages">
            {messages.map((m, idx) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                streaming={m.streaming}
                lang={lang}
                onSend={onSend}
                isLast={idx === messages.length - 1}
              />
            ))}
          </div>
        ) : (
          <WelcomeScreen onPick={onSend} specialtyId={specialtyId} lang={lang} />
        )}
      </div>

      <ChatInput
        value={inputValue}
        onChange={onInputChange}
        onSend={() => onSend(inputValue)}
        onStop={onStop}
        isResponding={isResponding}
        specialtyId={specialtyId}
        onSpecialtyChange={onSpecialtyChange}
        selectedConditions={selectedConditions}
        onToggleCondition={onToggleCondition}
        lang={lang}
        isWelcome={!hasMessages}
      />
    </div>
  )
}
