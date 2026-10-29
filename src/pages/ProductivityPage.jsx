import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, Maximize2, Minimize2, Pencil, Pin, Search, Trash2, XCircle } from 'lucide-react'
import { useCycle } from '../context/CycleContext'
import { useAuth } from '../context/AuthContext'
import { appService } from '../services/appService'
import { date, money, monthName, number } from '../lib/format'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import SubmissionForm from '../components/SubmissionForm'
import ExportButtons from '../components/ExportButtons'
import { useFeedback } from '../context/FeedbackContext'
import { smartIncludes } from '../lib/smartSearch'
import { playFeedbackSound } from '../lib/feedbackSound'
import { useSessionState } from '../lib/sessionCache'

const PRODUCTIVITY_PIN_KEY = 'stc_productivity_pinned_column'
const PRODUCTIVITY_PIN_COLUMNS = [
  { key: 'date', label: 'التاريخ' },
  { key: 'project', label: 'المشروع' },
  { key: 'engineers', label: 'المهندسين' },
  { key: 'technicians', label: 'الفنيين' },
  { key: 'assistants', label: 'المساعدين' },
  { key: 'workers', label: 'العمال' },
  { key: 'section', label: 'القطاع' },
  { key: 'meters', label: 'الأمتار' },
  { key: 'price', label: 'سعر المتر' },
  { key: 'total', label: 'الإجمالي' },
  { key: 'review', label: 'المراجعة' },
  { key: 'management', label: 'إدارة' },
  { key: 'notes', label: 'ملاحظات' },
]

const getInitialPinnedColumn = () => {
  if (typeof window === 'undefined') return ''
  const saved = window.localStorage.getItem(PRODUCTIVITY_PIN_KEY) || ''
  return PRODUCTIVITY_PIN_COLUMNS.some((item) => item.key === saved) ? saved : ''
}

export default function ProductivityPage() {
  const { selectedCycle, monthKey } = useCycle()
  const { permissions } = useAuth()
  const queryClient = useQueryClient()
  const feedback = useFeedback()
  const [searchParams, setSearchParams] = useSearchParams()
  const routeQuery = searchParams.get('q') || ''
  const routeReview = searchParams.get('review') || ''
  const routeAlert = searchParams.get('alert') || ''
  const routeDates = useMemo(
    () => (searchParams.get('dates') || '').split(',').map((item) => item.trim()).filter(Boolean),
    [searchParams],
  )
  const hasRouteQuery = searchParams.has('q')
  const hasRouteReview = searchParams.has('review')
  const hasRouteAlert = searchParams.has('alert')
  const [queryText, setQueryText] = useSessionState('page:productivity:query', routeQuery)
  const [project, setProject] = useSessionState('page:productivity:project', '')
  const [section, setSection] = useSessionState('page:productivity:section', '')
  const [review, setReview] = useSessionState('page:productivity:review', routeReview)
  const [pinnedColumn, setPinnedColumn] = useState(getInitialPinnedColumn)
  const [editing, setEditing] = useState(null)
  const [editInitial, setEditInitial] = useState(null)
  const [error, setError] = useState('')
  const [reviewCelebration, setReviewCelebration] = useState(null)
  const [tableExpanded, setTableExpanded] = useState(false)
  const exportRef = useRef(null)
  const tableScrollRef = useRef(null)

  const rowsQuery = useQuery({
    queryKey: ['cycle-data', 'productivity', monthKey],
    queryFn: () => appService.productivityRows(selectedCycle.cycle_start, selectedCycle.cycle_end),
    enabled: Boolean(selectedCycle),
  })

  const refsQuery = useQuery({ queryKey: ['references'], queryFn: appService.references })
  const rows = rowsQuery.data || []

  useEffect(() => {
    if (hasRouteAlert) {
      setQueryText('')
      setProject('')
      setSection('')
      setReview('')
      return
    }
    if (hasRouteQuery) setQueryText(routeQuery)
    if (hasRouteReview) setReview(routeReview)
  }, [
    hasRouteAlert, hasRouteQuery, hasRouteReview, routeQuery, routeReview,
    setProject, setQueryText, setReview, setSection,
  ])

  useEffect(() => {
    window.localStorage.setItem(PRODUCTIVITY_PIN_KEY, pinnedColumn)
  }, [pinnedColumn])

  useEffect(() => {
    if (!tableExpanded) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setTableExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [tableExpanded])

  const pinClass = (key, base = '') => [base, pinnedColumn === key ? 'productivity-pinned-column' : ''].filter(Boolean).join(' ')

  const projects = useMemo(() => [...new Set(rows.map((row) => row.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [rows])
  const sections = useMemo(() => [...new Set(rows.map((row) => row.section).filter(Boolean))].sort(), [rows])

  const routeDateSet = useMemo(() => new Set(routeDates), [routeDates])

  const alertFilterMeta = useMemo(() => {
    if (!routeAlert) return null
    if (routeAlert === 'zero_price') {
      return {
        title: 'أمتار بسعر صفر',
        description: 'يعرض العمليات التي بها أمتار منفذة وسعر المتر = 0.',
      }
    }
    if (routeAlert === 'no_team') {
      return {
        title: 'عمليات بدون فريق',
        description: 'يعرض العمليات المسجلة بدون مهندس أو فني أو مساعد أو عامل.',
      }
    }
    if (routeAlert === 'zero_meters') {
      return {
        title: 'إنتاجية صفر',
        description: 'يعرض العمليات التي تم تسجيلها بأمتار = 0.',
      }
    }
    if (routeAlert === 'high_days') {
      return {
        title: 'أيام أعلى من المعتاد',
        description: routeDates.length ? `العمليات المسجلة في: ${routeDates.join(' · ')}` : 'العمليات في الأيام الأعلى من المعتاد.',
      }
    }
    if (routeAlert === 'no_operations') {
      return {
        title: 'أيام عمل بلا عمليات',
        description: routeDates.length ? `لا توجد عمليات إنتاجية مسجلة في: ${routeDates.join(' · ')}` : 'لا توجد عمليات مسجلة في أيام العمل المحددة.',
      }
    }
    return null
  }, [routeAlert, routeDates])

  const filtered = useMemo(() => rows.filter((row) => {
    if (routeAlert === 'zero_price' && !(Number(row.meters || 0) > 0 && Number(row.price_per_meter || 0) === 0)) return false
    if (routeAlert === 'no_team' && (row.engineers || row.technicians || row.assistants || row.workers)) return false
    if (routeAlert === 'zero_meters' && Number(row.meters || 0) !== 0) return false
    if (routeAlert === 'high_days' && !routeDateSet.has(row.work_date)) return false
    if (routeAlert === 'no_operations') return false
    if (project && row.project !== project) return false
    if (section && row.section !== section) return false
    if (review && row.review_status !== review) return false
    if (!smartIncludes(queryText, row.project, row.section, row.engineers, row.technicians, row.assistants, row.workers, row.work_date, row.meters, row.price_per_meter, row.total, row.note)) return false
    return true
  }), [rows, routeAlert, routeDateSet, project, section, review, queryText])

  const clearAlertFilter = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('alert')
    next.delete('dates')
    setSearchParams(next, { replace: true })
  }

  const totals = useMemo(() => filtered.reduce((acc, row) => ({
    meters: acc.meters + Number(row.meters || 0),
    total: acc.total + Number(row.total || 0),
  }), { meters: 0, total: 0 }), [filtered])

  const excelSheets = [{
    name: 'البيانات المحسوبة',
    rows: filtered.map((row) => ({
      'التاريخ': date(row.work_date),
      'المشروع': row.project || '—',
      'المهندسين': row.engineers || '—',
      'الفنيين': row.technicians || '—',
      'المساعدين': row.assistants || '—',
      'العمال': row.workers || '—',
      'القطاع': row.section || '—',
      'الأمتار': Number(row.meters || 0),
      'سعر المتر': Number(row.price_per_meter || 0),
      'الإجمالي': Number(row.total || 0),
      'المراجعة': row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم',
      'الملاحظات': row.note || '',
    })),
  }]

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
    await queryClient.invalidateQueries({ queryKey: ['references'] })
  }

  const reviewMutation = useMutation({
    mutationFn: ({ id, reviewed }) => appService.setReview(id, reviewed),
    onSuccess: async (_data, variables) => {
      const completedAllReviews = Boolean(
        variables.reviewed
        && rows.length
        && rows.every((row) => row.id === variables.id || row.review_status === 'reviewed')
      )

      await invalidate()

      if (completedAllReviews) {
        setReviewCelebration({
          cycle: monthName(monthKey),
          operations: rows.length,
        })
        playFeedbackSound('success')
        return
      }

      if (!variables.reviewed) setReviewCelebration(null)
      feedback.success(variables.reviewed ? 'تم اعتماد المراجعة' : 'تم إلغاء المراجعة', 'تم تحديث حالة العملية بنجاح.')
    },
    onError: (err) => feedback.error('تعذر تحديث المراجعة', err.message || 'حدث خطأ غير متوقع'),
  })
  const noteMutation = useMutation({
    mutationFn: ({ id, note }) => appService.saveSubmissionNote(id, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
      await queryClient.invalidateQueries({ queryKey: ['person-full-details'] })
    },
    onError: (err) => feedback.error('تعذر حفظ الملاحظة', err.message || 'حدث خطأ غير متوقع'),
  })

  const deleteMutation = useMutation({
    mutationFn: appService.deleteSubmission,
    onSuccess: async () => {
      await invalidate()
      feedback.deleted('تم حذف العملية', 'تم تحديث البيانات والحضور المرتبط بها.')
    },
    onError: (err) => feedback.error('تعذر حذف العملية', err.message || 'حدث خطأ غير متوقع'),
  })
  const updateMutation = useMutation({
    mutationFn: appService.updateSubmission,
    onSuccess: async () => {
      setEditing(null)
      setEditInitial(null)
      await invalidate()
      feedback.success('تم حفظ التعديلات', 'تم تحديث العملية بنجاح.')
    },
    onError: (err) => feedback.error('تعذر حفظ التعديلات', err.message || 'حدث خطأ غير متوقع'),
  })

  const scrollTableHorizontally = (direction) => {
    const scroller = tableScrollRef.current
    if (!scroller) return
    const distance = Math.max(320, Math.round(scroller.clientWidth * 0.72))
    scroller.scrollBy({ left: direction * distance, behavior: 'smooth' })
  }

  const beginEdit = async (row) => {
    setTableExpanded(false)
    setError('')
    setEditing(row)
    try {
      const teamRows = await appService.submissionTeam(row.id)
      const team = { engineer: [], technician: [], assistant: [], worker: [] }
      teamRows.forEach((person) => team[person.role]?.push(person.person_id))
      setEditInitial({ work_date: row.work_date, project: row.project, section: row.section, price_per_meter: row.price_per_meter, meters: row.meters, expected_updated_at: row.updated_at, team })
    } catch (err) {
      setEditing(null)
      setError(err.message || 'تعذر تحميل بيانات العملية')
    }
  }

  const update = async ({ form, team }) => {
    await updateMutation.mutateAsync({
      p_submission_id: editing.id,
      p_work_date: form.work_date,
      p_project_name: form.project.trim(),
      p_section_name: form.section,
      p_meters: Number(form.meters || 0),
      p_engineer_ids: team.engineer,
      p_technician_ids: team.technician,
      p_assistant_ids: team.assistant,
      p_worker_ids: team.worker,
      p_expected_updated_at: editInitial?.expected_updated_at || null,
    })
  }

  const remove = async (row) => {
    const accepted = await feedback.confirm({
      title: 'حذف عملية الإنتاجية؟',
      message: 'الحذف نهائي وسيتم تحديث الحضور المرتبط بهذه العملية.',
      details: `${row.project} · ${date(row.work_date)} · ${number(row.meters)} متر · ${row.section}`,
      confirmLabel: 'حذف العملية',
      cancelLabel: 'رجوع',
      tone: 'danger',
    })
    if (!accepted) return
    try { await deleteMutation.mutateAsync(row.id) } catch (err) { setError(err.message) }
  }

  if (!selectedCycle || rowsQuery.isLoading || refsQuery.isLoading) return <div className="page-loader">جاري تحميل البيانات المحسوبة...</div>
  if (rowsQuery.isError || refsQuery.isError) return <div className="page-error">{rowsQuery.error?.message || refsQuery.error?.message || 'تعذر تحميل البيانات المحسوبة'}</div>

  return (
    <div className="page-stack">
      <div className={tableExpanded ? 'productivity-table-workspace is-expanded' : 'productivity-table-workspace'}>
      <section className="productivity-export-toolbar">
        <div className="productivity-export-toolbar__copy">
          <strong>لوحة الإنتاجية</strong>
          <span>تصدير البيانات المعروضة حاليًا بنفس الفلاتر المطبقة</span>
        </div>
        <div className="productivity-toolbar-actions">
          <button
            className="btn btn-secondary productivity-expand-btn"
            type="button"
            onClick={() => setTableExpanded((current) => !current)}
            aria-pressed={tableExpanded}
            title={tableExpanded ? 'الرجوع للعرض العادي (Esc)' : 'عرض جدول الإنتاجية على الشاشة بالكامل'}
          >
            {tableExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {tableExpanded ? 'إغلاق العرض' : 'عرض الجدول'}
          </button>
          <ExportButtons
            filename={`productivity-${monthKey}`}
            excelSheets={excelSheets}
            pdfTarget={exportRef}
          />
        </div>
      </section>

      {alertFilterMeta ? (
        <section className="productivity-drilldown-banner" aria-live="polite">
          <div>
            <span>فلتر من تنبيهات المراجعة</span>
            <strong>{alertFilterMeta.title}</strong>
            <small>{alertFilterMeta.description}</small>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={clearAlertFilter}>مسح فلتر التنبيه</button>
        </section>
      ) : null}

      <section className="summary-line">
        <div><span>النتائج المعروضة</span><strong>{number(filtered.length)} عملية</strong></div>
        <div><span>إجمالي الأمتار</span><strong>{number(totals.meters)} م</strong></div>
        <div><span>إجمالي الإنتاجية</span><strong>{money(totals.total)}</strong></div>
      </section>

      <section className="panel" ref={exportRef}>
        <div className="filters-bar">
          <div className="input-with-icon grow"><Search size={16} /><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="بحث في المشروع، القطاع، الفريق أو الملاحظات..." /></div>
          <select value={project} onChange={(e) => setProject(e.target.value)}><option value="">كل المشاريع</option>{projects.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={section} onChange={(e) => setSection(e.target.value)}><option value="">كل القطاعات</option>{sections.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={review} onChange={(e) => setReview(e.target.value)}><option value="">كل حالات المراجعة</option><option value="reviewed">تمت المراجعة</option><option value="not_reviewed">لم تتم المراجعة</option></select>
          <label className="pin-column-control" title="ثبّت عمود أثناء السكرول العرضي">
            <Pin size={15} />
            <select value={pinnedColumn} onChange={(e) => setPinnedColumn(e.target.value)} aria-label="تثبيت عمود">
              <option value="">بدون تثبيت</option>
              {PRODUCTIVITY_PIN_COLUMNS.filter((item) => item.key !== 'management' || permissions.isAdmin).map((item) => (
                <option key={item.key} value={item.key}>تثبيت: {item.label}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="table-scroll-shell productivity-table-shell">
          <button className="table-side-scroll-btn is-left" type="button" onClick={() => scrollTableHorizontally(-1)} title="تحريك الجدول لليسار" aria-label="تحريك الجدول لليسار"><ChevronLeft size={22} /></button>
          <button className="table-side-scroll-btn is-right" type="button" onClick={() => scrollTableHorizontally(1)} title="تحريك الجدول لليمين" aria-label="تحريك الجدول لليمين"><ChevronRight size={22} /></button>
          <div className="data-table-wrap productivity-scroll" ref={tableScrollRef}>
          <table className="data-table">
            <thead><tr>
              <th className={pinClass('date')}>التاريخ</th>
              <th className={pinClass('project')}>المشروع</th>
              <th className={pinClass('engineers')}>المهندسين</th>
              <th className={pinClass('technicians')}>الفنيين</th>
              <th className={pinClass('assistants')}>المساعدين</th>
              <th className={pinClass('workers')}>العمال</th>
              <th className={pinClass('section')}>القطاع</th>
              <th className={pinClass('meters')}>الأمتار</th>
              <th className={pinClass('price')}>سعر المتر</th>
              <th className={pinClass('total')}>الإجمالي</th>
              <th className={pinClass('review')}>المراجعة</th>
              {permissions.isAdmin ? <th className={pinClass('management')}>إدارة</th> : null}
              <th className={pinClass('notes')}>ملاحظات</th>
            </tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className={pinClass('date')}>{date(row.work_date)}</td>
                  <td className={pinClass('project', 'strong-cell')}>{row.project}</td>
                  <td className={pinClass('engineers')}>{row.engineers || '—'}</td>
                  <td className={pinClass('technicians')}>{row.technicians || '—'}{row.technician_count ? <small className="count-chip">{row.technician_count}</small> : null}</td>
                  <td className={pinClass('assistants')}>{row.assistants || '—'}{row.assistant_count ? <small className="count-chip">{row.assistant_count}</small> : null}</td>
                  <td className={pinClass('workers')}>{row.workers || '—'}{row.worker_count ? <small className="count-chip">{row.worker_count}</small> : null}</td>
                  <td className={pinClass('section')}>{row.section}</td>
                  <td className={pinClass('meters')}>{number(row.meters)}</td>
                  <td className={pinClass('price')}>{money(row.price_per_meter)}</td>
                  <td className={pinClass('total', 'strong-cell')}>{money(row.total)}</td>
                  <td className={pinClass('review')}><span className={`status-pill ${row.review_status === 'reviewed' ? 'success' : 'warning'}`}>{row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم'}</span></td>
                  {permissions.isAdmin ? <td className={pinClass('management')}><div className="row-actions"><button className="icon-btn small" title="تعديل" onClick={() => beginEdit(row)}><Pencil size={15} /></button><button className="icon-btn small" title={row.review_status === 'reviewed' ? 'إلغاء المراجعة' : 'اعتماد المراجعة'} onClick={() => reviewMutation.mutate({ id: row.id, reviewed: row.review_status !== 'reviewed' })}>{row.review_status === 'reviewed' ? <XCircle size={15} /> : <CheckCircle2 size={15} />}</button><button className="icon-btn small danger" title="حذف" onClick={() => remove(row)}><Trash2 size={15} /></button></div></td> : null}
                  <td className={pinClass('notes', 'operation-note-column')}>
                    <SubmissionNoteCell
                      row={row}
                      editable={permissions.canEditSubmissionNotes}
                      saving={noteMutation.isPending && noteMutation.variables?.id === row.id}
                      onSave={(id, note) => noteMutation.mutateAsync({ id, note })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? (
            <EmptyState
              title={routeAlert === 'no_operations'
                ? 'مفيش عمليات في أيام العمل المحددة'
                : rows.length ? 'مفيش نتائج مطابقة للفلاتر' : 'الدورة دي لسه مفيهاش عمليات'}
              description={routeAlert === 'no_operations'
                ? (routeDates.length ? `الأيام: ${routeDates.join(' · ')} — التنبيه معناه إن مفيش إنتاجية مسجلة في الأيام دي.` : 'لا توجد عمليات مسجلة في أيام العمل المحددة.')
                : rows.length ? 'غيّر البحث أو الفلاتر عشان تظهر العمليات.' : 'ابدأ بإضافة أول عملية إنتاجية للدورة الحالية.'}
              actionLabel={routeAlert ? 'مسح فلتر التنبيه' : rows.length ? 'مسح الفلاتر' : permissions.canCreateSubmission ? 'إدخال أول عملية' : ''}
              actionTo={!routeAlert && !rows.length && permissions.canCreateSubmission ? '/productivity/new' : ''}
              onAction={routeAlert
                ? clearAlertFilter
                : rows.length ? () => { setQueryText(''); setProject(''); setSection(''); setReview('') } : undefined}
              hint={routeAlert === 'no_operations'
                ? 'راجع التاريخ أو أضف العملية لو كان المفروض فيه شغل في اليوم ده.'
                : rows.length ? 'البيانات موجودة، لكن الفلاتر الحالية مخفية النتائج.' : 'أول عملية هتبدأ تظهر تلقائيًا في الـDashboard والتقارير.'}
            />
          ) : null}
          </div>
        </div>
      </section>
      </div>

      {reviewCelebration ? (
        <div className="review-complete-backdrop" role="presentation">
          <div className="review-confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, index) => (
              <i
                key={index}
                style={{
                  left: `${4 + ((index * 17) % 92)}%`,
                  animationDelay: `${(index % 8) * 0.07}s`,
                  animationDuration: `${1.55 + (index % 5) * 0.13}s`,
                  transform: `rotate(${(index * 29) % 180}deg)`,
                }}
              />
            ))}
          </div>
          <section className="review-complete-modal" role="dialog" aria-modal="true" aria-labelledby="review-complete-title">
            <div className="review-complete-check" aria-hidden="true">
              <CheckCircle2 size={92} strokeWidth={1.7} />
            </div>
            <span className="review-complete-eyebrow">REVIEW COMPLETED</span>
            <h2 id="review-complete-title">تمت مراجعة كل البيانات</h2>
            <p>خلصت مراجعة جميع عمليات {reviewCelebration.cycle} بنجاح.</p>
            <div className="review-complete-stat">
              <span>إجمالي العمليات المُراجَعة</span>
              <strong>{number(reviewCelebration.operations)} عملية</strong>
            </div>
            <button className="btn btn-primary review-complete-close" type="button" onClick={() => setReviewCelebration(null)}>
              <CheckCircle2 size={18} /> تمام
            </button>
          </section>
        </div>
      ) : null}

      <Modal open={Boolean(editing)} title="تعديل عملية الإنتاجية" onClose={() => { setEditing(null); setEditInitial(null) }} width="xl">
        {!editInitial || refsQuery.isLoading ? <div className="page-loader">جاري تحميل بيانات العملية...</div> : <SubmissionForm references={refsQuery.data} initial={editInitial} onSubmit={update} submitting={updateMutation.isPending} mode="edit" />}
      </Modal>
    </div>
  )
}


function SubmissionNoteCell({ row, editable, onSave }) {
  const [value, setValue] = useState(row.note || '')
  const [state, setState] = useState('idle')
  const timerRef = useRef(null)
  const onSaveRef = useRef(onSave)
  const lastSavedRef = useRef((row.note || '').trim())

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    setValue(row.note || '')
    lastSavedRef.current = (row.note || '').trim()
    setState('idle')
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [row.id])

  const saveNow = async () => {
    if (!editable) return
    const next = value.trim()
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (next === lastSavedRef.current) return

    setState('saving')
    try {
      await onSaveRef.current(row.id, next)
      lastSavedRef.current = next
      setState('saved')
    } catch {
      setState('error')
    }
  }

  useEffect(() => {
    if (!editable) return undefined
    const next = value.trim()
    if (next === lastSavedRef.current) return undefined

    setState('dirty')
    if (timerRef.current) window.clearTimeout(timerRef.current)

    timerRef.current = window.setTimeout(() => {
      saveNow()
    }, 900)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [editable, row.id, value])

  if (!editable) return <span className="operation-note-readonly">{row.note || '—'}</span>

  return (
    <div className="operation-note-editor">
      <textarea
        value={value}
        maxLength={2000}
        rows={2}
        placeholder="اكتب ملاحظة للعملية..."
        onChange={(event) => setValue(event.target.value)}
        onBlur={saveNow}
      />
      <small className={state === 'error' ? 'error' : state === 'saved' ? 'saved' : ''}>
        {state === 'saving'
          ? 'جاري الحفظ...'
          : state === 'saved'
            ? 'تم الحفظ ✓'
            : state === 'error'
              ? 'تعذر الحفظ — عدّل النص للمحاولة مرة أخرى'
              : state === 'dirty'
                ? 'سيتم الحفظ تلقائيًا...'
                : 'يتم الحفظ تلقائيًا'}
      </small>
    </div>
  )
}
