import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { appService } from '../services/appService'
import { detectDeviceInfo } from '../lib/devicePresence'

const HEARTBEAT_MS = 20000

export default function DevicePresenceTracker() {
  const { user } = useAuth()
  const location = useLocation()
  const deviceInfoRef = useRef(null)
  const pathRef = useRef(location.pathname)

  useEffect(() => {
    pathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!user?.id) return undefined

    let cancelled = false
    let intervalId = null

    const heartbeat = async () => {
      try {
        if (!deviceInfoRef.current) {
          deviceInfoRef.current = await detectDeviceInfo()
        }
        if (cancelled) return
        const info = deviceInfoRef.current
        await appService.upsertDevicePresence({
          userId: user.id,
          ...info,
          currentPath: pathRef.current,
        })
      } catch (error) {
        console.warn('Could not update device presence', error)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') heartbeat()
    }

    const handleFocus = () => heartbeat()

    heartbeat()
    intervalId = window.setInterval(heartbeat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || !deviceInfoRef.current) return
    appService.upsertDevicePresence({
      userId: user.id,
      ...deviceInfoRef.current,
      currentPath: location.pathname,
    }).catch((error) => console.warn('Could not update device presence path', error))
  }, [location.pathname, user?.id])

  return null
}
