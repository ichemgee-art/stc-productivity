import { useEffect, useState } from 'react'

const CACHE_PREFIX = 'stc_page_cache_v1:'

const resolveInitial = (value) => typeof value === 'function' ? value() : value

export const sessionCacheKey = (key) => `${CACHE_PREFIX}${key}`

export function readSessionCache(key, fallback = null) {
  const fallbackValue = resolveInitial(fallback)
  if (typeof window === 'undefined' || !key) return fallbackValue

  try {
    const raw = window.sessionStorage.getItem(sessionCacheKey(key))
    return raw == null ? fallbackValue : JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

export function writeSessionCache(key, value) {
  if (typeof window === 'undefined' || !key) return
  try {
    window.sessionStorage.setItem(sessionCacheKey(key), JSON.stringify(value))
  } catch {
    // Cache failure must never break the app.
  }
}

export function clearSessionCache(key) {
  if (typeof window === 'undefined' || !key) return
  try {
    window.sessionStorage.removeItem(sessionCacheKey(key))
  } catch {
    // Ignore browser storage failures.
  }
}

export function clearAllSessionCache() {
  if (typeof window === 'undefined') return
  try {
    const keys = []
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // Ignore browser storage failures.
  }
}

export function useSessionState(key, initialValue, { enabled = true } = {}) {
  const [state, setState] = useState(() => (
    enabled ? readSessionCache(key, initialValue) : resolveInitial(initialValue)
  ))

  useEffect(() => {
    if (enabled) writeSessionCache(key, state)
  }, [enabled, key, state])

  return [state, setState]
}
