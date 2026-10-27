import { fetchAll, supabase, unwrap } from './serviceUtils'

export const catalogService = {
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

  async deleteProject(id) {
    return unwrap(await supabase.rpc('admin_delete_project', { p_id: id }))
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
}
