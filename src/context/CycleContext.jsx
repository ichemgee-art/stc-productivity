import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { appService } from '../services/appService'
import { useSessionState } from '../lib/sessionCache'
import { useAuth } from './AuthContext'

const CycleContext = createContext(null)

export function CycleProvider({ children }) {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const [monthKey, setMonthKey] = useSessionState('cycle:selected', null)

  const cyclesQuery = useQuery({
    queryKey: ['available-cycles'],
    queryFn: appService.availableCycles,
    enabled: Boolean(session),
  })

  useEffect(() => {
    if (!session) setMonthKey(null)
  }, [session])

  useEffect(() => {
    const cycles = cyclesQuery.data || []
    if (!cycles.length) return
    const stillExists = monthKey && cycles.some((cycle) => cycle.month_key === monthKey)
    if (stillExists) return
    const active = cycles.find((cycle) => cycle.is_active) || cycles[0]
    setMonthKey(active.month_key)
  }, [cyclesQuery.data, monthKey])

  const selectedCycle = useMemo(
    () => (cyclesQuery.data || []).find((cycle) => cycle.month_key === monthKey) || null,
    [cyclesQuery.data, monthKey],
  )

  const selectCycle = (nextMonthKey) => {
    setMonthKey(nextMonthKey)
    queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
  }

  const refreshCycles = () => queryClient.invalidateQueries({ queryKey: ['available-cycles'] })

  return (
    <CycleContext.Provider value={{
      monthKey,
      selectedCycle,
      cycles: cyclesQuery.data || [],
      loading: cyclesQuery.isLoading,
      error: cyclesQuery.error,
      selectCycle,
      refreshCycles,
    }}>
      {children}
    </CycleContext.Provider>
  )
}

export const useCycle = () => useContext(CycleContext)
