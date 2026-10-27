import { fetchAll, supabase, unwrap } from './serviceUtils'

export const peopleService = {
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

  async historicalPersonOperations() {
    return fetchAll((from, to) => supabase
      .from('v_person_operations')
      .select('person_id,person_name,role,submission_id,work_date,project,meters,share_amount')
      .order('work_date', { ascending: false })
      .order('submission_id', { ascending: false })
      .order('person_id', { ascending: true })
      .range(from, to))
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
}
