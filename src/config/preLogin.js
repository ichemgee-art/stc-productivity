const configuredAccountRequestUrl = import.meta.env.VITE_ACCOUNT_REQUEST_URL?.trim()

const fallbackSubject = encodeURIComponent('طلب الوصول إلى iChem Productivity')
const fallbackBody = encodeURIComponent('إلى مسؤول النظام [SUPPORT_EMAIL]\n\nأرغب في طلب الوصول إلى iChem Productivity.')

export const accountRequestUrl = configuredAccountRequestUrl
  || `mailto:?subject=${fallbackSubject}&body=${fallbackBody}`

export const accountRequestConfigured = Boolean(configuredAccountRequestUrl)
