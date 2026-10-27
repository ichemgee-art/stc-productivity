import { queryClient } from '../lib/queryClient'
import { invalidateProductivity } from '../lib/projectProgress'
import { fetchAll, supabase, unwrap } from './serviceUtils'

export const productivityService = {
  async productivityRows(start, end) {
    return fetchAll((from, to) => supabase
      .from('v_master_data')
      .select('*')
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date', { ascending: false })
      .order('submitted_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to))
  },

  async historicalProductivityRows() {
    return fetchAll((from, to) => supabase
      .from('v_master_data')
      .select('*')
      .order('work_date', { ascending: false })
      .order('submitted_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to))
  },

  async submissionTeam(submissionId) {
    return unwrap(
      await supabase
        .from('submission_people')
        .select('person_id,role')
        .eq('submission_id', submissionId),
    ) || []
  },

  async createSubmission(payload) {
    const result = unwrap(await supabase.rpc('create_productivity_submission', payload))
    await invalidateProductivity(queryClient)
    return result
  },

  async updateSubmission(payload) {
    const result = unwrap(await supabase.rpc('update_productivity_submission', payload))
    await invalidateProductivity(queryClient)
    return result
  },

  async setReview(id, reviewed) {
    return unwrap(await supabase.rpc('set_review_status', { p_submission_id: id, p_reviewed: reviewed }))
  },

  async saveSubmissionNote(id, note) {
    return unwrap(await supabase.rpc('upsert_submission_note', {
      p_submission_id: id,
      p_note: note || '',
    }))
  },

  async deleteSubmission(id) {
    const result = unwrap(await supabase.rpc('delete_productivity_submission', { p_submission_id: id }))
    await invalidateProductivity(queryClient)
    return result
  },
}
