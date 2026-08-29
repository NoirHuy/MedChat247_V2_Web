import { useEffect, useRef } from 'react'
import { getGoogleClientId } from '../utils/googleAuthConfig'

const SCRIPT_ID = 'google-identity-services'

function loadGsiScript(onReady) {
  if (window.google?.accounts?.id) {
    onReady()
    return
  }
  const existing = document.getElementById(SCRIPT_ID)
  if (existing) {
    existing.addEventListener('load', onReady, { once: true })
    return
  }
  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.addEventListener('load', onReady, { once: true })
  document.head.appendChild(script)
}

export default function GoogleAuthButton({ onCredential }) {
  const containerRef = useRef(null)
  const onCredentialRef = useRef(onCredential)
  onCredentialRef.current = onCredential

  useEffect(() => {
    let cancelled = false
    const clientId = getGoogleClientId()

    if (!clientId) return

    loadGsiScript(() => {
      if (cancelled || !containerRef.current || !window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredentialRef.current?.(response.credential),
      })
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 360,
          locale: 'vi',
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return <div ref={containerRef} className="google-auth-button" />
}
