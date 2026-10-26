import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bell, CheckCircle2, CircleAlert, ClipboardCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCycle } from '../context/CycleContext'
import { appService } from '../services/appService'
import { useFeedback } from '../context/FeedbackContext'

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const PERIODIC_ALERT_KEY = 'stc_periodic_notification_last_at'

export default function NotificationCenter() {
  const { monthKey, selectedCycle } = useCycle()
  const { alert: alertFeedback } = useFeedback()
  const [open, setOpen] = useState(false)

  const rowsQuery = useQuery({
    queryKey: ['cycle-data', 'productivity', monthKey],
    queryFn: () => appService.productivityRows(selectedCycle.cycle_start, selectedCycle.cycle_end),
    enabled: Boolean(selectedCycle),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })

  const attendanceQuery = useQuery({
    queryKey: ['cycle-data', 'attendance', monthKey],
    queryFn: () => appService.attendance(monthKey),
    enabled: Boolean(monthKey),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })

  const items = useMemo(() => {
    const rows = rowsQuery.data || []
    const attendance = attendanceQuery.data || []
    const notifications = []

    if (rowsQuery.isError || attendanceQuery.isError) {
      notifications.push({
        id: 'load-error',
        tone: 'danger',
        icon: CircleAlert,
        title: 'تعذر تحديث التنبيهات',
        text: 'لم نتمكن من التحقق من أحدث البيانات. افتح مركز التنبيهات أو استخدم زر تحديث النظام للمحاولة مرة أخرى.',
        to: '/',
      })
      return notifications
    }

    const unreviewed = rows.filter((row) => row.review_status !== 'reviewed')
    if (unreviewed.length) {
      notifications.push({
        id: 'unreviewed',
        tone: 'warning',
        icon: ClipboardCheck,
        title: 'عمليات تحتاج مراجعة',
        text: `${unreviewed.length} عملية لم يتم اعتماد مراجعتها بعد.`,
        to: '/productivity?review=not_reviewed',
      })
    }

    const zeroPrice = rows.filter((row) => Number(row.meters || 0) > 0 && Number(row.price_per_meter || 0) === 0)
    if (zeroPrice.length) {
      notifications.push({
        id: 'zero-price',
        tone: 'danger',
        icon: CircleAlert,
        title: 'أمتار بسعر صفر',
        text: `${zeroPrice.length} عملية بها تنفيذ فعلي وسعر المتر يساوي صفر.`,
        to: '/productivity',
      })
    }

    const noTeam = rows.filter((row) => !row.engineers && !row.technicians && !row.assistants && !row.workers)
    if (noTeam.length) {
      notifications.push({
        id: 'no-team',
        tone: 'danger',
        icon: Users,
        title: 'عمليات بدون فريق',
        text: `${noTeam.length} عملية مسجلة بدون فريق تنفيذ.`,
        to: '/productivity',
      })
    }

    const uncategorizedAbsence = attendance.filter((row) =>
      row.status === 'absent' && !row.is_friday && !row.absence_type
    )
    if (uncategorizedAbsence.length) {
      notifications.push({
        id: 'absence',
        tone: 'warning',
        icon: AlertTriangle,
        title: 'غياب يحتاج تصنيف',
        text: `${uncategorizedAbsence.length} حالة غياب بدون تحديد نوع الغياب.`,
        to: '/attendance',
      })
    }

    if (!notifications.length && !rowsQuery.isLoading && !attendanceQuery.isLoading) {
      notifications.push({
        id: 'clear',
        tone: 'success',
        icon: CheckCircle2,
        title: 'لا توجد تنبيهات حرجة',
        text: 'البيانات الحالية لا تحتوي على حالات تشغيلية واضحة تحتاج تدخلًا.',
        to: '/',
        passive: true,
      })
    }

    return notifications
  }, [rowsQuery.data, attendanceQuery.data, rowsQuery.isLoading, attendanceQuery.isLoading, rowsQuery.isError, attendanceQuery.isError])

  const count = items.filter((item) => !item.passive).length

  useEffect(() => {
    if (rowsQuery.isLoading || attendanceQuery.isLoading) return undefined

    const runDigest = () => {
      const now = Date.now()
      const stored = Number(window.localStorage.getItem(PERIODIC_ALERT_KEY) || 0)

      if (!stored) {
        window.localStorage.setItem(PERIODIC_ALERT_KEY, String(now))
        return
      }

      if (now - stored < FIVE_HOURS_MS) return

      const message = items
        .map((item) => `• ${item.title}: ${item.text}`)
        .join('\n')

      alertFeedback(
        count ? `تنبيه دوري · ${count} ملاحظة تحتاج متابعة` : 'تنبيه دوري · الحالة مستقرة',
        message || 'لا توجد تنبيهات تشغيلية في الدورة الحالية.',
        14000,
      )
      window.localStorage.setItem(PERIODIC_ALERT_KEY, String(now))
    }

    runDigest()
    const interval = window.setInterval(runDigest, 60_000)
    return () => window.clearInterval(interval)
  }, [alertFeedback, attendanceQuery.isLoading, count, items, rowsQuery.isLoading])

  return (
    <div className="notification-center">
      <button
        className={`icon-btn notification-trigger ${count ? 'has-alerts' : ''}`}
        type="button"
        onClick={async () => {
          const nextOpen = !open
          setOpen(nextOpen)
          if (nextOpen) {
            await Promise.all([
              rowsQuery.refetch(),
              attendanceQuery.refetch(),
            ])
          }
        }}
        title="التنبيهات"
        aria-label="التنبيهات"
        aria-expanded={open}
      >
        <Bell size={18} />
        {count ? <span className="notification-count">{count > 9 ? '9+' : count}</span> : null}
      </button>

      {open ? (
        <>
          <button className="floating-backdrop" type="button" aria-label="إغلاق التنبيهات" onClick={() => setOpen(false)} />
          <section className="notification-popover">
            <header>
              <div>
                <strong>مركز التنبيهات</strong>
                <span>الدورة المعروضة حاليًا</span>
              </div>
              {count ? <b>{count}</b> : null}
            </header>
            <div className="notification-list">
              {items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.id}
                    className={`notification-item tone-${item.tone}`}
                    to={item.to}
                    onClick={() => setOpen(false)}
                  >
                    <span className="notification-item__icon"><Icon size={17} /></span>
                    <div><strong>{item.title}</strong><small>{item.text}</small></div>
                  </Link>
                )
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
