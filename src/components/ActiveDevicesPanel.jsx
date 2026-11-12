import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Clock3, Laptop, Monitor, Pencil, RefreshCw, Smartphone, Tablet, UserRound, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { roleLabels } from '../lib/format'
import { appService } from '../services/appService'
import { getDeviceId } from '../lib/devicePresence'

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

function sinceSeconds(value) {
  const seconds = Math.max(0, Number(value || 0))
  if (seconds < 10) return 'الآن'
  if (seconds < 60) return `منذ ${Math.floor(seconds)} ث`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `منذ ${minutes} د`
  const hours = Math.floor(minutes / 60)
  return `منذ ${hours} س`
}

function durationSeconds(value) {
  const seconds = Math.max(0, Number(value || 0))
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return 'أقل من دقيقة'
  if (minutes < 60) return `${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} س ${rest} د` : `${hours} ساعة`
}

function DeviceRow({ row, onSaved, isCurrent }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(row.custom_name || '')
  const [saving, setSaving] = useState(false)
  const DeviceIcon = deviceIcon(row.device_kind)
  const visibleName = row.custom_name || row.device_label
  const deviceDetails = row.custom_name
    ? row.device_label
    : [row.platform, row.browser, row.model].filter(Boolean).join(' · ')

  const saveName = async () => {
    if (saving) return
    setSaving(true)
    try {
      await appService.renameDevice(row.user_id, row.device_id, name)
      setEditing(false)
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    setName(row.custom_name || '')
    setEditing(false)
  }

  return (
    <article className="active-device-row">
      <div className="active-device-row__device">
        <span className="active-device-icon"><DeviceIcon size={20} /></span>
        <div>
          <div className="active-device-title">
            {editing ? (
              <div className="device-name-editor">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoFocus
                  placeholder="مثال: HP مكتب جرجس"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveName()
                    if (event.key === 'Escape') cancelEdit()
                  }}
                />
                <button type="button" onClick={saveName} disabled={saving} title="حفظ اسم الجهاز" aria-label="حفظ اسم الجهاز"><Check size={14} /></button>
                <button type="button" onClick={cancelEdit} disabled={saving} title="إلغاء" aria-label="إلغاء تعديل اسم الجهاز"><X size={14} /></button>
              </div>
            ) : (
              <>
                <strong>{visibleName}</strong>
                <button className="device-rename-btn" type="button" onClick={() => setEditing(true)} title="تسمية الجهاز" aria-label={`تسمية الجهاز ${visibleName}`}><Pencil size={13} /></button>
              </>
            )}
            {isCurrent ? <span className="this-device-badge">هذا الجهاز</span> : null}
            <span className="live-dot">متصل الآن</span>
          </div>
          <small>{deviceDetails}</small>
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
          <strong>{sinceSeconds(row.last_seen_seconds)}</strong>
          <small>مفتوح من {durationSeconds(row.session_seconds)}</small>
        </div>
      </div>
    </article>
  )
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
  const currentDeviceId = useMemo(() => getDeviceId(), [])

  if (!isAdmin) return null

  return (
    <section className="panel active-devices-panel">
      <header className="active-devices-header">
        <div>
          <span className="eyebrow">LIVE PRESENCE</span>
          <h3>الأجهزة المفتوح عليها النظام الآن</h3>
          <p>الوقت محسوب من سيرفر Supabase. اسم الجهاز التلقائي قد يكون عامًا؛ استخدم علامة القلم لتسميته مثل HP مكتب جرجس أو iPhone إسـراء.</p>
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
          {rows.map((row) => (
            <DeviceRow
              key={`${row.user_id}-${row.device_id}`}
              row={row}
              isCurrent={row.device_id === currentDeviceId}
              onSaved={() => query.refetch()}
            />
          ))}
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
