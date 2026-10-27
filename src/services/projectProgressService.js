import { fetchAll, supabase, unwrap } from './serviceUtils'

const normalizeOptionalNumber = (value, label) => {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} يجب أن تكون رقمًا صحيحًا`)
  return parsed
}

export const projectProgressService = {
  async projectProgressProductivity() {
    return fetchAll((from, to) => supabase
      .from('submissions')
      .select('id,project_id,meters')
      .order('id')
      .range(from, to))
  },

  async projectProgressRows() {
    return fetchAll((from, to) => supabase
      .from('v_project_progress')
      .select('*')
      .order('display_number', { ascending: true, nullsFirst: false })
      .order('legacy_excel_row', { ascending: true, nullsFirst: false })
      .range(from, to))
  },

  async deleteProjectProgress(id) {
    return unwrap(await supabase.rpc('delete_project_progress', { p_id: id }))
  },

  async saveProjectProgress(payload) {
    const normalizedPayload = {
      ...payload,
      contract_quantity: normalizeOptionalNumber(payload.contract_quantity, 'كميات العقد'),
      historical_before_system: normalizeOptionalNumber(payload.historical_before_system, 'كميات ما قبل النظام') ?? 0,
      manual_executed_quantity: payload.execution_mode === 'manual'
        ? (normalizeOptionalNumber(payload.manual_executed_quantity, 'الكميات المنفذة') ?? 0)
        : null,
    }

    return unwrap(await supabase.rpc('save_project_progress', { p_payload: normalizedPayload }))
  },
}
