import { supabase } from '../lib/supabase'

const PAGE_SIZE = 1000

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

async function fetchAll(buildQuery, pageSize = PAGE_SIZE) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await buildQuery(from, from + pageSize - 1)) || []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

export const appService = {
  async profile(userId) {
    return unwrap(await supabase.from('profiles').select('display_name,app_role').eq('user_id', userId).single())
  },

  async availableCycles() {
    return unwrap(await supabase.from('v_available_cycles').select('*').order('cycle_start', { ascending: false })) || []
  },

  async businessToday() {
    return unwrap(await supabase.rpc('business_today'))
  },

  async activeCycleMonthKey() {
    return unwrap(await supabase.rpc('active_cycle_month_key'))
  },

  async cycleBounds(monthKey) {
    const data = unwrap(await supabase.rpc('cycle_bounds', { p_month_key: monthKey }))
    return Array.isArray(data) ? data[0] : data
  },

  async setActiveCycle(monthKey) {
    return unwrap(await supabase.rpc('set_active_cycle', { p_month_key: monthKey }))
  },

  async dashboard(monthKey) {
    return unwrap(await supabase.rpc('dashboard_data', { p_month_key: monthKey }))
  },

  async auditEntries() {
    const [logs, profiles] = await Promise.all([
      fetchAll((from, to) => supabase
        .from('audit_log')
        .select('*')
        .order('id', { ascending: false })
        .range(from, to)),
      fetchAll((from, to) => supabase
        .from('profiles')
        .select('user_id,display_name,app_role')
        .order('user_id')
        .range(from, to)),
    ])
    const profileMap = new Map(profiles.map((row) => [row.user_id, row]))
    return logs.map((row) => ({
      ...row,
      actor_name: profileMap.get(row.user_id)?.display_name || 'System',
      actor_role: profileMap.get(row.user_id)?.app_role || null,
    }))
  },

  async restoreAuditEvent(id) {
    return unwrap(await supabase.rpc('admin_restore_audit_event', { p_audit_id: Number(id) }))
  },

  async cyclePersonOperations(start, end) {
    return fetchAll((from, to) => supabase
      .from('v_person_operations')
      .select('person_id,person_name,role,submission_id,work_date,project,meters,share_amount')
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date', { ascending: true })
      .order('submission_id', { ascending: true })
      .order('person_id', { ascending: true })
      .range(from, to))
  },

  async references() {
    const [people, sections, projects, rules, businessToday] = await Promise.all([
      fetchAll((from, to) => supabase.from('people').select('id,name,role,active').order('role').order('name').range(from, to)),
      fetchAll((from, to) => supabase.from('sections').select('id,name,price_per_meter,active').order('name').range(from, to)),
      fetchAll((from, to) => supabase.from('projects').select('id,name,active,created_at').order('name').range(from, to)),
      supabase.from('system_state').select('tech_share,assistant_share,worker_rate_per_meter').eq('id', 1).single(),
      supabase.rpc('business_today'),
    ])
    return {
      people,
      sections,
      projects,
      rules: unwrap(rules),
      businessToday: unwrap(businessToday),
    }
  },

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

  async historicalPersonOperations() {
    return fetchAll((from, to) => supabase
      .from('v_person_operations')
      .select('person_id,person_name,role,submission_id,work_date,project,meters,share_amount')
      .order('work_date', { ascending: false })
      .order('submission_id', { ascending: false })
      .order('person_id', { ascending: true })
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
    return unwrap(await supabase.rpc('create_productivity_submission', payload))
  },

  async updateSubmission(payload) {
    return unwrap(await supabase.rpc('update_productivity_submission', payload))
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
    return unwrap(await supabase.rpc('delete_productivity_submission', { p_submission_id: id }))
  },

  async personStats(monthKey, role) {
    return unwrap(await supabase.rpc('person_cycle_stats', { p_month_key: monthKey, p_role: role })) || []
  },

  async personNotes(role, start, end) {
    return fetchAll((from, to) => supabase
      .from('v_person_operations')
      .select('person_id,submission_id,work_date,project,note')
      .eq('role', role)
      .neq('note', '')
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date', { ascending: false })
      .order('submission_id', { ascending: false })
      .range(from, to))
  },

  async people(role) {
    return fetchAll((from, to) => supabase
      .from('people')
      .select('id,name,role,active')
      .eq('role', role)
      .order('active', { ascending: false })
      .order('name')
      .range(from, to))
  },

  async savePerson({ id = null, name, role, active = true }) {
    return unwrap(await supabase.rpc('admin_save_person', {
      p_id: id,
      p_name: name,
      p_role: role,
      p_active: active,
    }))
  },

  async deletePerson(id) {
    return unwrap(await supabase.rpc('admin_delete_person', { p_id: id }))
  },

  async personOperations(personId, start, end) {
    return fetchAll((from, to) => supabase
      .from('v_person_operations')
      .select('*')
      .eq('person_id', personId)
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date', { ascending: false })
      .order('submission_id', { ascending: false })
      .range(from, to))
  },

  async attendance(monthKey) {
    return fetchAll((from, to) => supabase
      .rpc('attendance_for_cycle', { p_month_key: monthKey })
      .range(from, to))
  },

  async saveAbsence(personId, attendanceDate, type) {
    return unwrap(await supabase.rpc('upsert_absence_type', {
      p_person_id: personId,
      p_date: attendanceDate,
      p_type: type || null,
    }))
  },

  async saveAttendanceNote(personId, attendanceDate, note) {
    return unwrap(await supabase.rpc('upsert_attendance_note', {
      p_person_id: personId,
      p_date: attendanceDate,
      p_note: note,
    }))
  },

  async projects() {
    const [projects, usageRows] = await Promise.all([
      fetchAll((from, to) => supabase.from('projects').select('id,name,active').order('name').range(from, to)),
      fetchAll((from, to) => supabase.from('v_project_autocomplete').select('*').order('name').range(from, to)),
    ])
    const usageMap = new Map(usageRows.map((row) => [row.id, row]))
    return projects.map((project) => ({
      ...project,
      use_count: usageMap.get(project.id)?.use_count || 0,
      last_used: usageMap.get(project.id)?.last_used || null,
    }))
  },

  async saveProject({ id = null, name, active = true }) {
    return unwrap(await supabase.rpc('admin_save_project', {
      p_id: id,
      p_name: name,
      p_active: active,
    }))
  },

  async sections() {
    return fetchAll((from, to) => supabase
      .from('sections')
      .select('id,name,price_per_meter,active')
      .order('name')
      .range(from, to))
  },

  async saveSection({ id = null, name, price, active = true }) {
    return unwrap(await supabase.rpc('admin_save_section', {
      p_id: id,
      p_name: name,
      p_price: Number(price),
      p_active: active,
    }))
  },

  async deleteSection(id) {
    return unwrap(await supabase.rpc('admin_delete_section', { p_id: id }))
  },

  async askAI(payload) {
    const { data, error } = await supabase.functions.invoke('operations-ai', { body: payload })
    if (error) {
      let message = error.message || 'تعذر تشغيل المساعد الذكي'
      try {
        const body = await error.context?.json()
        if (body?.error) message = body.error
      } catch {
        // Keep the original Functions error message when no JSON body is available.
      }
      throw new Error(message)
    }
    return data
  },
}
