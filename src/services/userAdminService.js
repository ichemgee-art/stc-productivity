import { supabase } from '../lib/supabase'

async function invokeUserAdmin(body) {
  const { data, error } = await supabase.functions.invoke('user-admin', { body })
  if (error) {
    let message = error.message || 'تعذر تنفيذ العملية'
    try {
      const payload = await error.context?.json()
      if (payload?.error) message = payload.error
    } catch {
      // Keep original Functions error.
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const userAdminService = {
  async users() {
    const data = await invokeUserAdmin({ action: 'list_users' })
    return data?.users || []
  },

  async createUser({ email, password, displayName, appRole }) {
    return invokeUserAdmin({
      action: 'create_user',
      email,
      password,
      display_name: displayName,
      app_role: appRole,
    })
  },

  async updateUserRole(userId, appRole) {
    return invokeUserAdmin({
      action: 'update_role',
      user_id: userId,
      app_role: appRole,
    })
  },

  async updateUserPassword(userId, password) {
    return invokeUserAdmin({
      action: 'update_password',
      user_id: userId,
      password,
    })
  },
}
