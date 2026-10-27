export const roleLabels = {
  admin: 'Admin',
  viewer: 'Viewer',
  engineer: 'مهندس',
  technician: 'فني',
  assistant: 'مساعد ممتاز',
  worker: 'عامل',
}

export const rolePlural = {
  engineer: 'المهندسين',
  technician: 'الفنيين',
  assistant: 'المساعدين',
  worker: 'العمال',
}

export const number = (value, maximumFractionDigits = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number(value || 0))

export const money = (value) => `${number(value)} ج.م`

export function date(value) {
  if (!value) return '—'
  const iso = String(value).slice(0, 10)
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export const today = () => {
  const d = new Date()
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export const monthName = (monthKey) => {
  if (!monthKey) return '—'
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}
