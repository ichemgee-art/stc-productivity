import { supabase } from '../lib/supabase'

const recentErrors = new Map()
const DEDUPE_WINDOW_MS = 60_000
const MAX_MESSAGE = 1200
const MAX_STACK = 8000
const MAX_COMPONENT_STACK = 5000

const clip = (value, max) => {
  const text = value == null ? '' : String(value)
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const safeMetadata = (metadata = {}) => {
  const allowed = {}
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      allowed[key] = value
    }
  }
  return allowed
}

const fingerprint = ({ source, message, route }) => `${source}|${route}|${message}`

export async function captureClientError(error, {
  source = 'client',
  severity = 'error',
  componentStack = '',
  metadata = {},
  route = typeof window !== 'undefined' ? window.location.pathname : '',
} = {}) {
  try {
    const message = clip(error?.message || error || 'Unknown client error', MAX_MESSAGE)
    const key = fingerprint({ source, message, route })
    const now = Date.now()
    const last = recentErrors.get(key) || 0
    if (now - last < DEDUPE_WINDOW_MS) return
    recentErrors.set(key, now)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return

    const payload = {
      route: clip(route, 500),
      source: clip(source, 120),
      severity: severity === 'warning' ? 'warning' : 'error',
      message,
      stack: clip(error?.stack || '', MAX_STACK) || null,
      component_stack: clip(componentStack, MAX_COMPONENT_STACK) || null,
      release: clip(import.meta.env.VITE_APP_RELEASE || import.meta.env.MODE || '', 200) || null,
      user_agent: typeof navigator !== 'undefined' ? clip(navigator.userAgent, 1000) : null,
      metadata: safeMetadata(metadata),
    }

    const { error: insertError } = await supabase.from('client_error_events').insert(payload)
    if (insertError && import.meta.env.DEV) console.warn('Monitoring insert failed', insertError)
  } catch (monitoringError) {
    if (import.meta.env.DEV) console.warn('Monitoring capture failed', monitoringError)
  }
}

export function installGlobalMonitoring() {
  if (typeof window === 'undefined') return () => {}

  const onError = (event) => {
    captureClientError(event.error || new Error(event.message || 'Window error'), {
      source: 'window.error',
      metadata: {
        filename: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0,
      },
    })
  }

  const onUnhandledRejection = (event) => {
    const reason = event.reason instanceof Error
      ? event.reason
      : new Error(typeof event.reason === 'string' ? event.reason : 'Unhandled promise rejection')
    captureClientError(reason, { source: 'unhandledrejection' })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
