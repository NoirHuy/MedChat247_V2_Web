// Single source of truth for reaching the backend API.
//
// - VITE_API_URL set  -> all requests target that origin (custom deploys).
// - VITE_API_URL empty-> relative /api/* URLs are used. In production Caddy
//   proxies /api/* to the backend container; in development the Vite dev
//   server proxies /api/* to http://localhost:4000 (see vite.config.js).
export const API_URL = (import.meta.env.VITE_API_URL || '').trim()

export function apiUrl(path) {
  return `${API_URL}${path}`
}

/**
 * JSON fetch helper with the project-wide defaults (credentials included,
 * no-store caching, JSON body parsing, Vietnamese default error message).
 */
export async function apiRequest(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Yêu cầu thất bại (${res.status})`)
  return data
}
