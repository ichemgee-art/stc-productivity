import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { appService } from '../services/appService'
import { permissionsFor } from '../lib/permissions'
import { queryClient } from '../lib/queryClient'
import { clearAllSessionCache } from '../lib/sessionCache'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const activeUserId = useRef(null)

  useEffect(() => {
    let mounted = true

    const hydrate = async (nextSession) => {
      if (!mounted) return
      const nextUserId = nextSession?.user?.id || null
      if (activeUserId.current !== nextUserId) {
        queryClient.clear()
        activeUserId.current = nextUserId
        setProfile(null)
      }
      setSession(nextSession)
      setError('')
      if (!nextSession) {
        setProfile(null)
        setLoading(false)
        return
      }
      try {
        const nextProfile = await appService.profile(nextSession.user.id)
        if (mounted) setProfile(nextProfile)
      } catch (err) {
        if (mounted) {
          setError(err.message || 'تعذر تحميل صلاحيات المستخدم')
          setProfile(null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => hydrate(nextSession))

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    setError('')
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
    if (data.session) {
      const nextProfile = await appService.profile(data.session.user.id)
      setSession(data.session)
      setProfile(nextProfile)
    }
    return data
  }

  const signOut = async () => {
    queryClient.clear()
    clearAllSessionCache()
    setProfile(null)
    setSession(null)
    activeUserId.current = null
    return supabase.auth.signOut()
  }
  const permissions = useMemo(() => permissionsFor(profile?.app_role), [profile?.app_role])

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    profile,
    loading,
    error,
    signIn,
    signOut,
    permissions,
  }), [session, profile, loading, error, permissions])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
