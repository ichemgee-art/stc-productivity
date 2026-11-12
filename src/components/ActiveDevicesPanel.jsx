import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock3, Laptop, Monitor, RefreshCw, Smartphone, Tablet, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { roleLabels } from '../lib/format'
import { appService } from '../services/appService'

const pageLabels = {
  '/': 'لوحة الإدارة',
  '/productivity': 'الإنتاجية',
  '/productivity/new': 'تسجيل إنتاجية',
  '/attendance': 'الحضور والغياب',
  '/project-progress': 'متابعة المشاريع',
  '/project-progress/new': 'تسجيل متابعة مشروع',
  '/projects': 'المشاريع',
  '/sections': 'القطاعات والأسعار',
  '/comparison': 'مقارنة الشهور',
  '/report': 'التقرير التنفيذي',
  '/quarter': 'حساب الكوارتر',
  '/audit': 'سجل التعديلات',
  '/admin/users': 'إدارة المستخدمين',
  '/admin/system-usage': 'استهلاك النظام',
}

function pathLabel(path = '/') {
  if (pageLabels[path]) return pageLabels[path]
  if (path.startsWith('/people/engineer')) return 'المهندسين'
  if (path.startsWith('/people/technician')) return 'الفنيين'
  if (path.startsWith('/people/assistant')) return 'المساعدين'
  if (path.startsWith('/people/worker')) return 'العمال'
  if (/^\/project-progress\/[^/]+$/.test(path)) return 'ملف مشروع'
  return path
}

function deviceIcon(kind) {
  if (kind === 'mobile') return Smartphone
  if (kind === 'tablet') return Tablet
  if (kind === 'desktop') return Monitor
  return Laptop
}

function since(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 10) return 'الآن'
  if (seconds < 60) return `منذ ${seconds} ث`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `منذ ${minutes} د`
  const hours = Math.floor(minutes / 60)
  return `منذ ${hours} س`
}

function duration(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'أقل من دقيقة'
  if (minutes < 60) return `${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} س ${rest} د` : `${hours} ساعة`
}

export default function ActiveDevicesPanel() {
  const { profile } = useAuth()
  const isAdmin = profile?.app_role === 'admin'

  const query = useQuery({
    queryKey: ['admin-active-devices'],
    queryFn: () => appService.activeDevices(),
    enabled: isAdmin,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const rows = query.data || []
  const userCount = useMemo(() => new Set(rows.map((row) => row.user_id)).size, [rows])

  if (!isAdmin) return null

  return (
    <section className="panel active-devices-panel">
      <header className="active-devices-header">
        <div>
          <span className="eyebrow">LIVE PRESENCE</span>
          <h3>الأجهزة المفتوح عليها النظام الآن</h3>
          <p>الجهاز يظل ظاهرًا طالما يرسل نشاطًا حديثًا، ويختفي تلقائيًا بعد انقطاع الاتصال.</p>
        </div>
        <div className="active-devices-header__summary">
          <span><strong>{rows.length}</strong> جهاز</span>
          <span><strong>{userCount}</strong> مستخدم</span>
          <button
            className="icon-btn"
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            title="تحديث الأجهزة"
            aria-label="تحديث الأجهزة النشطة"
          >
            <RefreshCw size={17} className={query.isFetching ? 'is-spinning' : ''} />
          </button>
        </div>
      </header>

      {query.isLoading ? (
        <div className="system-usage-loading">جاري قراءة الأجهزة النشطة...</div>
      ) : query.isError ? (
        <div className="page-error">تعذر تحميل الأجهزة النشطة: {query.error?.message || 'خطأ غير معروف'}</div>
      ) : rows.length ? (
        <div className="active-devices-list">
          {rows.map((row) => {
            const DeviceIcon = deviceIcon(row.device_kind)
            return (
              <article className="active-device-row" key={`${row.user_id}-${row.device_id}`}>
                <div className="active-device-row__device">
                  <span className="active-device-icon"><DeviceIcon size={20} /></span>
                  <div>
                    <div className="active-device-title">
                      <strong>{row.device_label}</strong>
                      <span className="live-dot">متصل الآن</span>
                    </div>
                    <small>{row.platform} · {row.browser}{row.model ? ` · ${row.model}` : ''}</small>
                  </div>
                </div>

                <div className="active-device-row__user">
                  <UserRound size={15} />
                  <div>
                    <strong>{row.display_name || 'مستخدم'}</strong>
                    <small>{roleLabels[row.app_role] || row.app_role || '—'}</small>
                  </div>
                </div>

                <div className="active-device-row__page">
                  <span>الصفحة الحالية</span>
                  <strong>{pathLabel(row.current_path)}</strong>
                </div>

                <div className="active-device-row__time">
                  <Clock3 size={15} />
                  <div>
                    <strong>{since(row.last_seen_at)}</strong>
                    <small>مفتوح من {duration(row.first_seen_at)}</small>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="active-devices-empty">
          <Monitor size={22} />
          <div><strong>لا توجد أجهزة نشطة الآن</strong><span>ستظهر هنا الأجهزة بمجرد فتح النظام وتسجيل الدخول.</span></div>
        </div>
      )}
    </section>
  )
}
