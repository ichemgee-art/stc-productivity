import { fetchAll, supabase, unwrap } from './serviceUtils'

export const systemService = {
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
}
