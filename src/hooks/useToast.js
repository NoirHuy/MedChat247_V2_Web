import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 2600

export function useToast() {
  const [message, setMessage] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const showToast = useCallback((text, duration = TOAST_DURATION_MS) => {
    clearTimeout(timerRef.current)
    setMessage(text)
    timerRef.current = setTimeout(() => setMessage(null), duration)
  }, [])

  return { message, showToast }
}
