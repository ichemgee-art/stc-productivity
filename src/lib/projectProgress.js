export const PROJECT_PROGRESS_CATEGORIES = [
  {
    value: 'completed_handed_over',
    label: 'مشاريع انتهت وتم التسليم',
    shortLabel: 'انتهت وتم التسليم',
    description: 'تم إنهاء الأعمال وتسليم المشروع.',
  },
  {
    value: 'nearing_completion',
    label: 'مشاريع شارفت على الانتهاء',
    shortLabel: 'شارفت على الانتهاء',
    description: 'متبقي أعمال أو نقاط بسيطة قبل التسليم.',
  },
  {
    value: 'phased_client_request',
    label: 'مشاريع مرحلية بناءً على طلب العميل',
    shortLabel: 'مرحلية بطلب العميل',
    description: 'التنفيذ مقسم على مراحل حسب طلب العميل.',
  },
  {
    value: 'active',
    label: 'مشاريع قائمة',
    shortLabel: 'قائمة',
    description: 'المشروع قائم وأعماله مستمرة.',
  },
]

export function projectCategoryLabel(value, { short = false } = {}) {
  const item = PROJECT_PROGRESS_CATEGORIES.find((category) => category.value === value)
  if (!item) return 'غير مصنف'
  return short ? item.shortLabel : item.label
}

export function progressMetersById(rows = []) {
  return rows.reduce((map, row) => {
    if (row.project_id) map[row.project_id] = (map[row.project_id] || 0) + Number(row.meters || 0)
    return map
  }, {})
}

export async function invalidateProductivity(client) {
  await Promise.all(['cycle-data', 'available-cycles', 'references', 'person-full-details', 'project-progress']
    .map((key) => client.invalidateQueries({ queryKey: [key] })))
}

// A request survives ambiguous network failures; only a changed intent gets a new key.
export function progressRequest(previous, payload, uuid = () => crypto.randomUUID()) {
  const fingerprint = JSON.stringify(payload)
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, id: uuid() }
}
