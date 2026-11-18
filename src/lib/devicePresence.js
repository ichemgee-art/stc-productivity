const DEVICE_ID_KEY = 'stc_device_presence_id'

function fallbackUuid() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return [...bytes].map((byte, index) => {
    const hex = byte.toString(16).padStart(2, '0')
    return [4, 6, 8, 10].includes(index) ? `-${hex}` : hex
  }).join('')
}

export function getDeviceId() {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const next = crypto.randomUUID ? crypto.randomUUID() : fallbackUuid()
  window.localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

function browserFromUserAgent(ua, brands = []) {
  const brandNames = brands.map((item) => item.brand).filter((brand) => !/not.?a.?brand/i.test(brand || ''))
  const joined = brandNames.join(' ')
  if (/Edge|Microsoft Edge/i.test(joined) || /Edg\//.test(ua)) return 'Edge'
  if (/Google Chrome/i.test(joined) || /Chrome\//.test(ua)) return /OPR\//.test(ua) ? 'Opera' : 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR\//.test(ua)) return 'Safari'
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet'
  return brandNames[0] || 'Browser'
}

function platformFromUserAgent(ua, uaPlatform = '') {
  if (/Windows/i.test(uaPlatform) || /Windows NT/i.test(ua)) return 'Windows'
  if (/Android/i.test(uaPlatform) || /Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/macOS|Mac/i.test(uaPlatform) || /Macintosh|Mac OS X/i.test(ua)) return 'macOS'
  if (/Linux/i.test(uaPlatform) || /Linux/i.test(ua)) return 'Linux'
  return uaPlatform || 'Unknown'
}

function kindFromUserAgent(ua, mobileHint) {
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  if (mobileHint || /iPhone|iPod|Android.*Mobile|Mobile/i.test(ua)) return 'mobile'
  if (/Android/i.test(ua)) return 'tablet'
  return 'desktop'
}

function modelFromUserAgent(ua) {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  const android = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/i)
  if (android?.[1]) {
    const value = android[1].trim()
    if (!/^[a-z]{2}[-_][A-Z]{2}$/i.test(value)) return value
  }
  return ''
}

function genericDeviceName(platform, kind) {
  if (platform === 'Windows') return 'Windows PC'
  if (platform === 'macOS') return 'Mac'
  if (platform === 'iOS') return kind === 'tablet' ? 'iPad' : 'iPhone'
  if (platform === 'Android') return kind === 'tablet' ? 'Android Tablet' : 'Android Phone'
  if (platform === 'Linux') return 'Linux PC'
  if (kind === 'mobile') return 'Mobile Device'
  if (kind === 'tablet') return 'Tablet'
  return 'Computer'
}

function gpuRenderer() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return ''
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
  } catch {
    return ''
  }
}

async function hashFingerprint(parts) {
  const value = parts.map((part) => String(part ?? '')).join('|')
  if (crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fallback-${(hash >>> 0).toString(16)}`
}

export async function detectDeviceInfo() {
  const ua = navigator.userAgent || ''
  const uaData = navigator.userAgentData
  const browser = browserFromUserAgent(ua, uaData?.brands || [])
  const platform = platformFromUserAgent(ua, uaData?.platform || navigator.platform || '')
  const kind = kindFromUserAgent(ua, Boolean(uaData?.mobile))
  let model = modelFromUserAgent(ua)
  let architecture = ''
  let bitness = ''

  if (uaData?.getHighEntropyValues) {
    try {
      const highEntropy = await uaData.getHighEntropyValues(['model', 'architecture', 'bitness'])
      if (highEntropy?.model) model = highEntropy.model.trim()
      architecture = highEntropy?.architecture || ''
      bitness = highEntropy?.bitness || ''
    } catch {
      // High entropy client hints are optional; generic detection remains valid.
    }
  }

  const baseName = model || genericDeviceName(platform, kind)
  const fingerprint = await hashFingerprint([
    platform,
    kind,
    model || '',
    architecture,
    bitness,
    navigator.hardwareConcurrency || '',
    navigator.deviceMemory || '',
    navigator.maxTouchPoints || 0,
    window.screen?.width || '',
    window.screen?.height || '',
    window.screen?.colorDepth || '',
    window.devicePixelRatio || '',
    gpuRenderer(),
  ])

  return {
    deviceId: getDeviceId(),
    deviceFingerprint: fingerprint,
    deviceLabel: `${baseName} · ${browser}`,
    deviceKind: kind,
    platform,
    browser,
    model: model || null,
  }
}
