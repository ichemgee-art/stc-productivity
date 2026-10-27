import { supabase } from '../lib/supabase'

export const PAGE_SIZE = 1000

export const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

export async function fetchAll(buildQuery, pageSize = PAGE_SIZE) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await buildQuery(from, from + pageSize - 1)) || []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

export { supabase }
