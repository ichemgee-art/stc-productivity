import { useQuery } from '@tanstack/react-query'
import { Database, Files, HardDrive, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { appService } from '../services/appService'

const DATABASE_LIMIT_BYTES = 500 * 1024 * 1024
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024

const toNumber = (value) => Number(value || 0)
const clampPercent = (value) => Math.max(0, Math.min(100, Number(value || 0)))

function formatBytes(value) {
  const bytes = toNumber(value)
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`
  return `${(bytes / (1024 ** 2)).toFixed(bytes >= 10 * 1024 ** 2 ? 1 : 2)} MB`
}

function formatCount(value) {
  return toNumber(value).toLocaleString('en-US')
}

function UsageCard({ icon: Icon, label, used, limit, note }) {
  const percent = limit > 0 ? (used / limit) * 100 : 0
  const remaining = Math.max(0, limit - used)
  const tone = percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'safe'

  return (
    <article className={`system-usage-card tone-${tone}`}>
      <div className="system-usage-card__head">
        <span className="system-usage-card__icon"><Icon size={19} /></span>
        <div>
          <span>{label}</span>
          <strong>{formatBytes(used)} <em>من</em> {formatBytes(limit)}</strong>
        </div>
        <b>{percent.toFixed(1)}%</b>
      </div>
      <div className="system-usage-progress" aria-label={`${label}: ${percent.toFixed(1)}%`}>
        <span style={{ width: `${clampPercent(percent)}%` }} />
      </div>
      <div className="system-usage-card__foot">
        <span>المتبقي <strong>{formatBytes(remaining)}</strong></span>
        <small>{note}</small>
      </div>
    </article>
  )
}

export default function SystemUsagePanel() {
  const { profile } = useAuth()
  const isAdmin = profile?.app_role === 'admin'

  const query = useQuery({
    queryKey: ['admin-system-usage'],
    queryFn: () => appService.systemUsageSnapshot(),
    enabled: isAdmin,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  if (!isAdmin) return null

  const data = query.data
  const metrics = data ? [
    ['عمليات الإنتاجية', data.submissions],
    ['أفراد العمليات', data.submission_people],
    ['متابعات المشاريع', data.project_progress],
    ['المرفقات المسجلة', data.project_progress_attachments],
    ['أحداث سجل التعديلات', data.audit_events],
    ['الحضور والغياب', data.attendance_absence_rows],
    ['ملاحظات الحضور', data.attendance_notes],
    ['المشاريع', data.projects],
    ['الأفراد', data.people],
    ['القطاعات', data.sections],
    ['مستخدمي النظام', data.app_users],
    ['أخطاء الواجهة المسجلة', data.client_error_events],
  ] : []

  return (
    <section className="panel system-usage-panel">
      <header className="system-usage-header">
        <div>
          <span className="eyebrow">SUPABASE · FREE PLAN</span>
          <h3>استهلاك النظام</h3>
          <p>قراءة مباشرة من قاعدة البيانات والتخزين، وتتحدث تلقائيًا كل 10 ثواني أثناء فتح الصفحة.</p>
        </div>
        <div className="system-usage-header__actions">
          <span className="status-pill success"><ShieldCheck size={13} /> Admin only</span>
          <button
            className="icon-btn"
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            title="تحديث الاستهلاك"
            aria-label="تحديث استهلاك Supabase"
          >
            <RefreshCw size={17} className={query.isFetching ? 'is-spinning' : ''} />
          </button>
        </div>
      </header>

      {query.isLoading ? (
        <div className="system-usage-loading">جاري حساب استهلاك Supabase...</div>
      ) : query.isError ? (
        <div className="page-error">تعذر تحميل استهلاك Supabase: {query.error?.message || 'خطأ غير معروف'}</div>
      ) : data ? (
        <>
          <div className="system-usage-primary">
            <UsageCard
              icon={Database}
              label="حجم قاعدة البيانات"
              used={toNumber(data.database_bytes)}
              limit={DATABASE_LIMIT_BYTES}
              note="حد قاعدة البيانات في Free Plan لكل مشروع"
            />
            <UsageCard
              icon={HardDrive}
              label="File Storage"
              used={toNumber(data.storage_bytes)}
              limit={STORAGE_LIMIT_BYTES}
              note="الاستهلاك المعروض للمشروع الحالي؛ الحصة نفسها على مستوى الـOrganization"
            />
          </div>

          <div className="system-usage-strip">
            <div><Files size={17} /><span>الملفات الفعلية</span><strong>{formatCount(data.file_count)}</strong></div>
            <div><Users size={17} /><span>مستخدمي النظام</span><strong>{formatCount(data.app_users)}</strong></div>
            <div><Database size={17} /><span>إجمالي السجلات الرئيسية</span><strong>{formatCount(metrics.reduce((sum, [, value]) => sum + toNumber(value), 0))}</strong></div>
          </div>

          <div className="system-usage-metrics">
            {metrics.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{formatCount(value)}</strong>
              </div>
            ))}
          </div>

          <footer className="system-usage-footer">
            <span>آخر تحديث: {new Intl.DateTimeFormat('ar-EG', { timeStyle: 'medium' }).format(new Date(query.dataUpdatedAt || Date.now()))}</span>
            <small>الـDatabase هنا هو حجم PostgreSQL الفعلي. استهلاك الـStorage billing في Supabase يُحسب كمتوسط GB-Hours على دورة الفوترة، لذلك قد يختلف رقم الفاتورة عن الحجم اللحظي المعروض هنا.</small>
          </footer>
        </>
      ) : null}
    </section>
  )
}
