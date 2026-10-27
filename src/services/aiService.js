import { supabase } from './serviceUtils'

export const aiService = {
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
