import { fetchAll, supabase, unwrap } from './serviceUtils'

export const project360Service = {
  async project360(projectId) {
    const [projectResult, progressResult, operations] = await Promise.all([
      supabase
        .from('projects')
        .select('id,name,active,created_at')
        .eq('id', projectId)
        .maybeSingle(),
      supabase
        .from('v_project_progress')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchAll((from, to) => supabase
        .from('v_master_data')
        .select('id,project_id,project,project_current_name,work_date,submitted_at,updated_at,section,meters,price_per_meter,total,engineers,technicians,assistants,workers,note,review_status')
        .eq('project_id', projectId)
        .order('work_date', { ascending: false })
        .order('submitted_at', { ascending: false })
        .range(from, to)),
    ])

    const project = unwrap(projectResult)
    if (!project) return null

    return {
      project,
      progress: unwrap(progressResult) || null,
      operations,
    }
  },
}
