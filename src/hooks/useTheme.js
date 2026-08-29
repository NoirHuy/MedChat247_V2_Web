import { useCallback, useEffect, useState } from 'react'

// Unified "medai_" prefix for localStorage keys (medai_lang, medai_active_chat_id).
// Reads the legacy key once so existing users keep their theme.
const STORAGE_KEY = 'medai_theme'
const LEGACY_STORAGE_KEY = 'chat-med-theme'

function readStoredTheme() {
  return (
    localStorage.getItem(STORAGE_KEY) ??
    localStorage.getItem(LEGACY_STORAGE_KEY) ??
    'light'
  )
}

export function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
}
