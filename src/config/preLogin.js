const configuredAccountRequestUrl = import.meta.env.VITE_ACCOUNT_REQUEST_URL?.trim()

export const accountRequestUrl = configuredAccountRequestUrl
  || `mailto:[SUPPORT_EMAIL]?subject=${encodeURIComponent('طلب الوصول إلى iChem Productivity')}`

export const accountRequestConfigured = Boolean(configuredAccountRequestUrl)
