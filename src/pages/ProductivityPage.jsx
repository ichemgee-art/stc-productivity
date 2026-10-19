import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Columns3, Pencil, Pin, RotateCcw, Rows3, Save, Search, SlidersHorizontal, Trash2, X, XCircle } from 'lucide-react'
import { useCycle } from '../context/CycleContext'
import { useAuth } from '../context/AuthContext'
import { appService } from '../services/appService'
import { date, money, number } from '../lib/format'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import SubmissionForm from '../components/SubmissionForm'
import ExportButtons from '../components/ExportButtons'
import { useFeedback } from '../context/FeedbackContext'
import { smartIncludes } from '../lib/smartSearch'

const PRODUCTIVITY_PIN_KEY = 'stc_productivity_pinned_column'
const PRODUCTIVITY_COLUMNS_KEY = 'stc_productivity_hidden_columns'
const PRODUCTIVITY_DENSITY_KEY = 'stc_productivity_table_density'
const PRODUCTIVITY_SAVED_VIEW_KEY = 'stc_productivity_saved_view'
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
  const [searchParams] = useSearchParams()
  const routeQuery = searchParams.get('q') || ''
  const routeReview = searchParams.get('review') || ''
  const [queryText, setQueryText] = useState(routeQuery)
  const [project, setProject] = useState('')
  const [section, setSection] = useState('')
  const [review, setReview] = useState(routeReview)
  const [pinnedColumn, setPinnedColumn] = useState(getInitialPinnedColumn)
  const [density, setDensity] = useState(() => typeof window === 'undefined' ? 'comfortable' : (window.localStorage.getItem(PRODUCTIVITY_DENSITY_KEY) || 'comfortable'))
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(window.localStorage.getItem(PRODUCTIVITY_COLUMNS_KEY) || '[]')) } catch { return new Set() }
  })
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editInitial, setEditInitial] = useState(null)
  const [error, setError] = useState('')
  const exportRef = useRef(null)

  const rowsQuery = useQuery({
    queryKey: ['cycle-data', 'productivity', monthKey],
    queryFn: () => appService.productivityRows(selectedCycle.cycle_start, selectedCycle.cycle_end),
    enabled: Boolean(selectedCycle),
  })

  const refsQuery = useQuery({ queryKey: ['references'], queryFn: appService.references })
  const rows = rowsQuery.data || []

  useEffect(() => {
    setQueryText(routeQuery)
    setReview(routeReview)
  }, [routeQuery, routeReview])

  useEffect(() => {
    window.localStorage.setItem(PRODUCTIVITY_PIN_KEY, pinnedColumn)
  }, [pinnedColumn])

  useEffect(() => {
    window.localStorage.setItem(PRODUCTIVITY_DENSITY_KEY, density)
  }, [density])

  useEffect(() => {
    window.localStorage.setItem(PRODUCTIVITY_COLUMNS_KEY, JSON.stringify([...hiddenColumns]))
  }, [hiddenColumns])

  const pinClass = (key, base = '') => [base, pinnedColumn === key ? 'productivity-pinned-column' : ''].filter(Boolean).join(' ')

  const projects = useMemo(() => [...new Set(rows.map((row) => row.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [rows])
  const sections = useMemo(() => [...new Set(rows.map((row) => row.section).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => rows.filter((row) => {
    if (project && row.project !== project) return false
    if (section && row.section !== section) return false
    if (review && row.review_status !== review) return false
    if (!smartIncludes(queryText, row.project, row.section, row.engineers, row.technicians, row.assistants, row.workers, row.work_date, row.meters, row.price_per_meter, row.total, row.note)) return false
    return true
  }), [rows, project, section, review, queryText])

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
        feedback.success('اكتملت مراجعة الدورة', `تم اعتماد جميع عمليات الدورة (${rows.length} عملية).`)
        return
      }

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

  const beginEdit = async (row) => {
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

  const isColumnVisible = (key) => !hiddenColumns.has(key)
  const toggleColumn = (key) => setHiddenColumns((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const clearFilters = () => {
    setQueryText('')
    setProject('')
    setSection('')
    setReview('')
  }

  const activeFilters = [
    queryText ? { key: 'search', label: `بحث: ${queryText}`, clear: () => setQueryText('') } : null,
    project ? { key: 'project', label: `المشروع: ${project}`, clear: () => setProject('') } : null,
    section ? { key: 'section', label: `القطاع: ${section}`, clear: () => setSection('') } : null,
    review ? { key: 'review', label: review === 'reviewed' ? 'تمت المراجعة' : 'لم تتم المراجعة', clear: () => setReview('') } : null,
  ].filter(Boolean)

  const saveView = () => {
    window.localStorage.setItem(PRODUCTIVITY_SAVED_VIEW_KEY, JSON.stringify({
      queryText, project, section, review, pinnedColumn, density, hiddenColumns: [...hiddenColumns],
    }))
    feedback.success('تم حفظ العرض', 'سيتم الاحتفاظ بالفلاتر والأعمدة وطريقة عرض الجدول على هذا الجهاز.')
  }

  const restoreView = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PRODUCTIVITY_SAVED_VIEW_KEY) || 'null')
      if (!saved) return feedback.alert('لا يوجد عرض محفوظ', 'اضبط الفلاتر والأعمدة ثم اضغط «حفظ العرض».')
      setQueryText(saved.queryText || '')
      setProject(saved.project || '')
      setSection(saved.section || '')
      setReview(saved.review || '')
      setPinnedColumn(saved.pinnedColumn || '')
      setDensity(saved.density || 'comfortable')
      setHiddenColumns(new Set(saved.hiddenColumns || []))
      feedback.success('تم استعادة العرض', 'تم تطبيق الفلاتر وإعدادات الجدول المحفوظة.')
    } catch {
      feedback.error('تعذر استعادة العرض', 'إعدادات العرض المحفوظة غير صالحة.')
    }
  }

  if (!selectedCycle || rowsQuery.isLoading || refsQuery.isLoading) return <div className="page-loader">جاري تحميل البيانات المحسوبة...</div>
  if (rowsQuery.isError || refsQuery.isError) return <div className="page-error">{rowsQuery.error?.message || refsQuery.error?.message || 'تعذر تحميل البيانات المحسوبة'}</div>

  return (
    <div className="page-stack">
      <section className="productivity-export-toolbar productivity-page-toolbar">
        <div className="productivity-export-toolbar__copy">
          <strong>عمليات الدورة</strong>
          <span>ابحث وراجع وخصص الجدول بالطريقة المناسبة لشغلك.</span>
        </div>
        <div className="productivity-toolbar-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={saveView}><Save size={15} /> حفظ العرض</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={restoreView}><RotateCcw size={15} /> استعادة</button>
          <ExportButtons filename={`productivity-${monthKey}`} excelSheets={excelSheets} pdfTarget={exportRef} />
        </div>
      </section>

      <section className="summary-line productivity-summary">
        <div><span>النتائج المعروضة</span><strong>{number(filtered.length)} عملية</strong></div>
        <div><span>إجمالي الأمتار</span><strong>{number(totals.meters)} م</strong></div>
        <div><span>إجمالي الإنتاجية</span><strong>{money(totals.total)}</strong></div>
      </section>

      <section className="panel productivity-workspace" ref={exportRef}>
        <div className="filters-bar productivity-filters">
          <div className="input-with-icon grow"><Search size={16} /><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="بحث في المشروع، القطاع، الفريق أو الملاحظات..." /></div>
          <select value={project} onChange={(e) => setProject(e.target.value)}><option value="">كل المشاريع</option>{projects.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={section} onChange={(e) => setSection(e.target.value)}><option value="">كل القطاعات</option>{sections.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={review} onChange={(e) => setReview(e.target.value)}><option value="">كل حالات المراجعة</option><option value="reviewed">تمت المراجعة</option><option value="not_reviewed">لم تتم المراجعة</option></select>

          <div className="table-view-controls">
            <label className="pin-column-control" title="ثبّت عمود أثناء السكرول العرضي">
              <Pin size={15} />
              <select value={pinnedColumn} onChange={(e) => setPinnedColumn(e.target.value)} aria-label="تثبيت عمود">
                <option value="">بدون تثبيت</option>
                {PRODUCTIVITY_PIN_COLUMNS.filter((item) => item.key !== 'management' || permissions.isAdmin).map((item) => (
                  <option key={item.key} value={item.key}>تثبيت: {item.label}</option>
                ))}
              </select>
            </label>

            <div className="column-picker-wrap">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowColumnMenu((value) => !value)}><Columns3 size={15} /> الأعمدة</button>
              {showColumnMenu ? (
                <>
                  <button className="floating-backdrop" type="button" aria-label="إغلاق اختيار الأعمدة" onClick={() => setShowColumnMenu(false)} />
                  <div className="column-picker-popover">
                    <header><strong>الأعمدة الظاهرة</strong><small>خصص الجدول حسب مهمتك الحالية.</small></header>
                    {PRODUCTIVITY_PIN_COLUMNS.filter((item) => item.key !== 'management' || permissions.isAdmin).map((item) => (
                      <label key={item.key}><input type="checkbox" checked={isColumnVisible(item.key)} onChange={() => toggleColumn(item.key)} /><span>{item.label}</span></label>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <button className="btn btn-ghost btn-sm density-toggle" type="button" onClick={() => setDensity((value) => value === 'compact' ? 'comfortable' : 'compact')} title="تغيير كثافة الجدول">
              {density === 'compact' ? <Rows3 size={15} /> : <SlidersHorizontal size={15} />}
              {density === 'compact' ? 'مريح' : 'مضغوط'}
            </button>
          </div>
        </div>

        {activeFilters.length ? (
          <div className="active-filter-bar">
            <span>الفلاتر النشطة</span>
            <div>{activeFilters.map((item) => <button type="button" key={item.key} onClick={item.clear}>{item.label}<X size={13} /></button>)}</div>
            <button className="clear-all-filters" type="button" onClick={clearFilters}>مسح الكل</button>
          </div>
        ) : null}

        {error ? <div className="inline-error">{error}</div> : null}

        <div className="data-table-wrap productivity-scroll">
          <table className={`data-table productivity-table density-${density}`}>
            <thead><tr>
              {isColumnVisible('date') ? <th className={pinClass('date')}>التاريخ</th> : null}
              {isColumnVisible('project') ? <th className={pinClass('project')}>المشروع</th> : null}
              {isColumnVisible('engineers') ? <th className={pinClass('engineers')}>المهندسين</th> : null}
              {isColumnVisible('technicians') ? <th className={pinClass('technicians')}>الفنيين</th> : null}
              {isColumnVisible('assistants') ? <th className={pinClass('assistants')}>المساعدين</th> : null}
              {isColumnVisible('workers') ? <th className={pinClass('workers')}>العمال</th> : null}
              {isColumnVisible('section') ? <th className={pinClass('section')}>القطاع</th> : null}
              {isColumnVisible('meters') ? <th className={pinClass('meters')}>الأمتار</th> : null}
              {isColumnVisible('price') ? <th className={pinClass('price')}>سعر المتر</th> : null}
              {isColumnVisible('total') ? <th className={pinClass('total')}>الإجمالي</th> : null}
              {isColumnVisible('review') ? <th className={pinClass('review')}>المراجعة</th> : null}
              {permissions.isAdmin && isColumnVisible('management') ? <th className={pinClass('management')}>إدارة</th> : null}
              {isColumnVisible('notes') ? <th className={pinClass('notes')}>ملاحظات</th> : null}
            </tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {isColumnVisible('date') ? <td className={pinClass('date')}>{date(row.work_date)}</td> : null}
                  {isColumnVisible('project') ? <td className={pinClass('project', 'strong-cell')}>{row.project}</td> : null}
                  {isColumnVisible('engineers') ? <td className={pinClass('engineers')}>{row.engineers || '—'}</td> : null}
                  {isColumnVisible('technicians') ? <td className={pinClass('technicians')}>{row.technicians || '—'}{row.technician_count ? <small className="count-chip">{row.technician_count}</small> : null}</td> : null}
                  {isColumnVisible('assistants') ? <td className={pinClass('assistants')}>{row.assistants || '—'}{row.assistant_count ? <small className="count-chip">{row.assistant_count}</small> : null}</td> : null}
                  {isColumnVisible('workers') ? <td className={pinClass('workers')}>{row.workers || '—'}{row.worker_count ? <small className="count-chip">{row.worker_count}</small> : null}</td> : null}
                  {isColumnVisible('section') ? <td className={pinClass('section')}>{row.section}</td> : null}
                  {isColumnVisible('meters') ? <td className={pinClass('meters')}>{number(row.meters)}</td> : null}
                  {isColumnVisible('price') ? <td className={pinClass('price')}>{money(row.price_per_meter)}</td> : null}
                  {isColumnVisible('total') ? <td className={pinClass('total', 'strong-cell')}>{money(row.total)}</td> : null}
                  {isColumnVisible('review') ? <td className={pinClass('review')}><span className={`status-pill ${row.review_status === 'reviewed' ? 'success' : 'warning'}`}>{row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم'}</span></td> : null}
                  {permissions.isAdmin && isColumnVisible('management') ? <td className={pinClass('management')}><div className="row-actions"><button className="icon-btn small" title="تعديل" onClick={() => beginEdit(row)}><Pencil size={15} /></button><button className="icon-btn small" title={row.review_status === 'reviewed' ? 'إلغاء المراجعة' : 'اعتماد المراجعة'} onClick={() => reviewMutation.mutate({ id: row.id, reviewed: row.review_status !== 'reviewed' })}>{row.review_status === 'reviewed' ? <XCircle size={15} /> : <CheckCircle2 size={15} />}</button><button className="icon-btn small danger" title="حذف" onClick={() => remove(row)}><Trash2 size={15} /></button></div></td> : null}
                  {isColumnVisible('notes') ? (
                    <td className={pinClass('notes', 'operation-note-column')}>
                      <SubmissionNoteCell
                        row={row}
                        editable={permissions.canEditSubmissionNotes}
                        saving={noteMutation.isPending && noteMutation.variables?.id === row.id}
                        onSave={(id, note) => noteMutation.mutateAsync({ id, note })}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          {!filtered.length ? (
            <EmptyState
              title={rows.length ? 'مفيش نتائج مطابقة للفلاتر' : 'الدورة دي لسه مفيهاش عمليات'}
              description={rows.length ? 'غيّر البحث أو الفلاتر عشان تظهر العمليات.' : 'ابدأ بإضافة أول عملية إنتاجية للدورة الحالية.'}
              actionLabel={rows.length ? 'مسح الفلاتر' : permissions.canCreateSubmission ? 'إدخال أول عملية' : ''}
              actionTo={!rows.length && permissions.canCreateSubmission ? '/productivity/new' : ''}
              onAction={rows.length ? clearFilters : undefined}
              hint={rows.length ? 'البيانات موجودة، لكن الفلاتر الحالية مخفية النتائج.' : 'أول عملية هتبدأ تظهر تلقائيًا في لوحة الإنتاجية والتقارير.'}
            />
          ) : null}
        </div>
      </section>

      <Modal open={Boolean(editing)} title="تعديل عملية الإنتاجية" onClose={() => { setEditing(null); setEditInitial(null) }} width="drawer">
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

  useEffect(() => {
    if (!editable) return undefined
    const next = value.trim()
    if (next === lastSavedRef.current) return undefined

    setState('dirty')
    if (timerRef.current) window.clearTimeout(timerRef.current)

    timerRef.current = window.setTimeout(async () => {
      setState('saving')
      try {
        await onSaveRef.current(row.id, next)
        lastSavedRef.current = next
        setState('saved')
      } catch {
        setState('error')
      }
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
