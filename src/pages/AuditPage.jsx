import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, History, RotateCcw, Search, ShieldCheck, UserRound } from 'lucide-react'
import { appService } from '../services/appService'
import { useFeedback } from '../context/FeedbackContext'
import { smartIncludes } from '../lib/smartSearch'
import { date, money, number, roleLabels } from '../lib/format'
import EmptyState from '../components/EmptyState'

const actionLabels = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  review_status: 'تغيير المراجعة',
  update_note: 'تعديل ملاحظة',
  update_notes: 'تعديل ملاحظة قديم',
  restore: 'استرجاع',
  absence_type: 'تغيير الغياب',
  attendance_note: 'ملاحظة حضور',
  set_active_cycle: 'تغيير الدورة الحالية',
}

const entityLabels = {
  submission: 'عملية إنتاجية',
  person: 'شخص',
  project: 'مشروع',
  section: 'قطاع',
  attendance: 'حضور وغياب',
  system_state: 'إعدادات النظام',
}

const fieldDefs = [
  ['work_date', 'التاريخ', (v) => date(v)],
  ['project_name_snapshot', 'المشروع'],
  ['section_name_snapshot', 'القطاع'],
  ['engineer_names_snapshot', 'المهندسين'],
  ['technician_names_snapshot', 'الفنيين'],
  ['assistant_names_snapshot', 'المساعدين'],
  ['worker_names_snapshot', 'العمال'],
  ['meters', 'الأمتار', (v) => number(v)],
  ['price_per_meter', 'سعر المتر', (v) => money(v)],
  ['total', 'الإجمالي', (v) => money(v)],
  ['review_status', 'المراجعة', (v) => v === 'reviewed' ? 'تمت المراجعة' : 'لم تتم'],
  ['name', 'الاسم'],
  ['role', 'الدور', (v) => roleLabels[v] || v || '—'],
  ['price_per_meter', 'السعر', (v) => money(v)],
  ['active', 'الحالة', (v) => v ? 'نشط' : 'معطل'],
]

const fmtTime = (value) => {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const normalize = (value) => value == null ? '' : String(value)

function readValue(obj, key) {
  if (!obj) return ''
  if (key === 'project_name_snapshot') return obj.project_name_snapshot ?? obj.project ?? ''
  if (key === 'section_name_snapshot') return obj.section_name_snapshot ?? obj.section ?? ''
  return obj[key] ?? ''
}

function changeRows(row) {
  const details = row.details || {}

  if (row.action === 'review_status' && 'before' in details && 'after' in details) {
    return [{
      label: 'حالة المراجعة',
      before: details.before === 'reviewed' ? 'تمت المراجعة' : 'لم تتم',
      after: details.after === 'reviewed' ? 'تمت المراجعة' : 'لم تتم',
    }]
  }

  if (row.action === 'update_note' && 'before' in details && 'after' in details) {
    return [{ label: 'الملاحظة', before: details.before || '—', after: details.after || '—' }]
  }

  if (row.action === 'absence_type' && 'before' in details && 'after' in details) {
    const label = (value) => value === 'excused' ? 'غياب بإذن' : value === 'unexcused' ? 'غياب بدون إذن' : 'غير محدد'
    return [{ label: 'نوع الغياب', before: label(details.before), after: label(details.after) }]
  }

  if (row.action === 'attendance_note' && 'before' in details && 'after' in details) {
    return [{ label: 'ملاحظة الحضور', before: details.before || '—', after: details.after || '—' }]
  }

  if (row.action === 'set_active_cycle' && 'before' in details && 'after' in details) {
    return [{ label: 'الدورة الحالية', before: details.before || '—', after: details.after || '—' }]
  }

  const before = details.before || null
  const after = details.after_full || details.after || null
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return []

  const seen = new Set()
  const result = []
  for (const [key, label, formatter] of fieldDefs) {
    if (seen.has(key)) continue
    seen.add(key)
    const b = readValue(before, key)
    const a = readValue(after, key)
    if (normalize(b) === normalize(a)) continue
    result.push({
      label,
      before: formatter ? formatter(b) : (b || '—'),
      after: formatter ? formatter(a) : (a || '—'),
    })
  }
  return result
}

function eventSummary(row) {
  const d = row.details || {}
  const source = d.after_full || d.after || d.submission || d.before || d
  if (row.action === 'restore') return `استرجاع التعديل رقم #${d.original_audit_id || '—'}`
  if (row.entity_type === 'submission') {
    const project = source?.project_name_snapshot || source?.project || d.project || 'عملية إنتاجية'
    const workDate = source?.work_date || d.work_date
    return `${project}${workDate ? ` · ${date(workDate)}` : ''}`
  }
  if (row.entity_type === 'person') return source?.name || 'تعديل شخص'
  if (row.entity_type === 'project') return source?.name || 'تعديل مشروع'
  if (row.entity_type === 'section') return source?.name || 'تعديل قطاع'
  if (row.entity_type === 'attendance') return `${d.person_name || 'حضور وغياب'}${d.date ? ` · ${date(d.date)}` : ''}`
  if (row.entity_type === 'system_state') return 'إعدادات الدورة الحالية'
  return row.entity_id || '—'
}

function hasNewerBlockingEvent(row, rows) {
  const relevant = row.action === 'update'
    ? new Set(['update', 'delete', 'restore'])
    : row.action === 'review_status'
      ? new Set(['review_status', 'delete', 'restore'])
      : row.action === 'update_note'
        ? new Set(['update_note', 'delete', 'restore'])
        : new Set()

  if (!relevant.size) return false
  return rows.some((other) =>
    Number(other.id) > Number(row.id)
    && other.entity_type === row.entity_type
    && other.entity_id === row.entity_id
    && relevant.has(other.action)
  )
}

function canRestore(row, restoredIds, rows) {
  if (restoredIds.has(String(row.id))) return false
  if (row.entity_type !== 'submission') return false
  if (hasNewerBlockingEvent(row, rows)) return false
  const d = row.details || {}
  if (row.action === 'update') return Boolean(d.before)
  if (row.action === 'delete') return Boolean(d.submission)
  if (row.action === 'review_status') return Object.prototype.hasOwnProperty.call(d, 'before')
  if (row.action === 'update_note') return Object.prototype.hasOwnProperty.call(d, 'before')
  return false
}

export default function AuditPage() {
  const feedback = useFeedback()
  const queryClient = useQueryClient()
  const [queryText, setQueryText] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [actor, setActor] = useState('')

  const query = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => appService.auditEntries(),
  })

  const restoreMutation = useMutation({
    mutationFn: appService.restoreAuditEvent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['audit-log'] })
      await queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
      await queryClient.invalidateQueries({ queryKey: ['person-full-details'] })
      feedback.success('تم الاسترجاع', 'تمت إعادة البيانات السابقة وتسجيل عملية الاسترجاع في السجل.')
    },
    onError: (err) => feedback.error('تعذر الاسترجاع', err.message || 'حدث خطأ غير متوقع'),
  })

  const rows = query.data || []
  const restoredIds = useMemo(() => new Set(
    rows
      .filter((row) => row.action === 'restore' && row.details?.original_audit_id != null)
      .map((row) => String(row.details.original_audit_id)),
  ), [rows])

  const actors = useMemo(() => [...new Map(rows.map((row) => [row.user_id, {
    id: row.user_id,
    name: row.actor_name || 'System',
  }])).values()].filter((item) => item.id), [rows])

  const filtered = useMemo(() => rows.filter((row) => {
    if (action && row.action !== action) return false
    if (entity && row.entity_type !== entity) return false
    if (actor && row.user_id !== actor) return false
    if (!smartIncludes(queryText, row.actor_name, actionLabels[row.action], entityLabels[row.entity_type], eventSummary(row), JSON.stringify(row.details || {}))) return false
    return true
  }), [rows, action, entity, actor, queryText])

  const restore = async (row) => {
    const accepted = await feedback.confirm({
      title: 'استرجاع هذا التعديل؟',
      message: 'سيتم إعادة الحالة السابقة للبيانات، وسيتم تسجيل الاسترجاع كحدث جديد داخل سجل التعديلات.',
      details: `#${row.id} · ${actionLabels[row.action] || row.action} · ${eventSummary(row)}`,
      confirmLabel: 'استرجاع',
      cancelLabel: 'رجوع',
      tone: 'primary',
    })
    if (!accepted) return
    await restoreMutation.mutateAsync(row.id)
  }

  if (query.isLoading) return <div className="page-loader">جاري تحميل سجل التعديلات...</div>
  if (query.isError) return <div className="page-error">{query.error.message}</div>

  return (
    <div className="page-stack">
      <section className="management-hero audit-hero">
        <div>
          <span className="eyebrow">AUDIT TRAIL</span>
          <h2>سجل التعديلات</h2>
          <p>تتبع كامل لما تم تغييره، من نفذه، والقيم قبل وبعد. الاسترجاع متاح فقط للأحداث الآمنة والقابلة للعكس.</p>
        </div>
        <div className="audit-hero__icon"><ShieldCheck size={30} /></div>
      </section>

      <section className="panel">
        <div className="filters-bar audit-filters">
          <div className="input-with-icon grow"><Search size={16} /><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="ابحث في المستخدم، المشروع، الإجراء أو تفاصيل التعديل..." /></div>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">كل الإجراءات</option>
            {[...new Set(rows.map((row) => row.action))].map((item) => <option key={item} value={item}>{actionLabels[item] || item}</option>)}
          </select>
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">كل أنواع البيانات</option>
            {[...new Set(rows.map((row) => row.entity_type))].map((item) => <option key={item} value={item}>{entityLabels[item] || item}</option>)}
          </select>
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">كل المستخدمين</option>
            {actors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <span className="audit-count">{filtered.length} حدث</span>
        </div>

        <div className="audit-list">
          {filtered.map((row) => {
            const changes = changeRows(row)
            const restored = restoredIds.has(String(row.id))
            const reversible = canRestore(row, restoredIds, rows)
            return (
              <article className={`audit-event ${row.action === 'restore' ? 'is-restore' : ''}`} key={row.id}>
                <div className="audit-event__rail">
                  <span className={`audit-action-dot action-${row.action}`}><History size={15} /></span>
                </div>

                <div className="audit-event__body">
                  <div className="audit-event__top">
                    <div>
                      <div className="audit-event__title">
                        <span className={`audit-action-badge action-${row.action}`}>{actionLabels[row.action] || row.action}</span>
                        <strong>{entityLabels[row.entity_type] || row.entity_type}</strong>
                        <span>#{row.id}</span>
                      </div>
                      <p>{eventSummary(row)}</p>
                    </div>
                    <div className="audit-event__meta">
                      <span><UserRound size={14} /> {row.actor_name || 'System'}{row.actor_role ? ` · ${roleLabels[row.actor_role] || row.actor_role}` : ''}</span>
                      <span><Clock3 size={14} /> {fmtTime(row.occurred_at)}</span>
                    </div>
                  </div>

                  {changes.length ? (
                    <div className="audit-diff-grid">
                      {changes.map((item) => (
                        <div className="audit-diff" key={item.label}>
                          <strong>{item.label}</strong>
                          <div><span className="before">{String(item.before)}</span><span className="audit-arrow">←</span><span className="after">{String(item.after)}</span></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="audit-summary-box">{eventSummary(row)}</div>
                  )}

                  <div className="audit-event__footer">
                    {restored ? <span className="status-pill neutral">تم استرجاعه</span> : null}
                    {reversible ? (
                      <button className="btn btn-ghost btn-sm audit-restore-btn" disabled={restoreMutation.isPending} onClick={() => restore(row)}>
                        <RotateCcw size={14} /> استرجاع الحالة السابقة
                      </button>
                    ) : <span className="audit-readonly-note">سجل للعرض فقط</span>}
                  </div>
                </div>
              </article>
            )
          })}
          {!filtered.length ? <EmptyState title="لا توجد أحداث مطابقة للفلاتر" /> : null}
        </div>
      </section>
    </div>
  )
}
