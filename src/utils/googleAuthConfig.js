let dynamicGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || null

export function setDynamicGoogleClientId(id) {
  if (id) {
    dynamicGoogleClientId = id
  }
}

export function getGoogleClientId() {
  return dynamicGoogleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || null
}

export function isGoogleAuthConfigured() {
  return Boolean(getGoogleClientId())
}
