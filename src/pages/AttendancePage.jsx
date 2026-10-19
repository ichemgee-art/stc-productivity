import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarCheck2, CalendarX2, Search, ShieldCheck, X } from 'lucide-react'
import { useCycle } from '../context/CycleContext'
import { useAuth } from '../context/AuthContext'
import { appService } from '../services/appService'
import { date, roleLabels } from '../lib/format'
import EmptyState from '../components/EmptyState'
import ExportButtons from '../components/ExportButtons'
import { smartIncludes } from '../lib/smartSearch'
import { useFeedback } from '../context/FeedbackContext'

const attendanceStatusLabel = (row) => {
  if (row.status === 'present') return row.is_friday ? 'حاضر (جمعة)' : 'حاضر'
  if (row.status === 'absent') return 'غياب'
  return 'قادم'
}

export default function AttendancePage() {
  const { monthKey } = useCycle()
  const { permissions } = useAuth()
  const queryClient = useQueryClient()
  const feedback = useFeedback()
  const [role, setRole] = useState('')
  const [person, setPerson] = useState('')
  const [status, setStatus] = useState('')
  const [absenceFilter, setAbsenceFilter] = useState('')
  const [queryText, setQueryText] = useState('')
  const [error, setError] = useState('')
  const exportRef = useRef(null)

  const query = useQuery({ queryKey: ['cycle-data', 'attendance', monthKey], queryFn: () => appService.attendance(monthKey), enabled: Boolean(monthKey) })
  const rows = query.data || []

  const people = useMemo(() => [...new Map(rows.filter((row) => !role || row.role === role).map((row) => [row.person_id, { id: row.person_id, name: row.person_name }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')), [rows, role])
  const filtered = useMemo(() => rows.filter((row) => {
    if (role && row.role !== role) return false
    if (person && row.person_id !== person) return false
    if (status && row.status !== status) return false
    if (absenceFilter === 'excused' && !(row.status === 'absent' && row.absence_type === 'excused')) return false
    if (absenceFilter === 'unexcused' && !(row.status === 'absent' && row.absence_type === 'unexcused')) return false
    if (absenceFilter === 'uncategorized' && !(row.status === 'absent' && !row.absence_type)) return false
    if (!smartIncludes(queryText, row.person_name, row.attendance_date, row.status, row.absence_type, row.note)) return false
    return true
  }), [rows, role, person, status, absenceFilter, queryText])

  const summary = useMemo(() => {
    const effective = rows.filter((row) => row.status !== 'upcoming')
    const present = effective.filter((row) => row.status === 'present').length
    const absent = effective.filter((row) => row.status === 'absent').length
    const excused = effective.filter((row) => row.status === 'absent' && row.absence_type === 'excused').length
    const unexcused = effective.filter((row) => row.status === 'absent' && row.absence_type === 'unexcused').length
    const uncategorized = effective.filter((row) => row.status === 'absent' && !row.absence_type).length
    const friday = effective.filter((row) => row.status === 'present' && row.is_friday).length
    const rate = present + absent ? (present / (present + absent)) * 100 : 0
    return { present, absent, excused, unexcused, uncategorized, friday, rate }
  }, [rows])

  const clearFilters = () => {
    setRole('')
    setPerson('')
    setStatus('')
    setAbsenceFilter('')
    setQueryText('')
  }

  const absenceMutation = useMutation({
    mutationFn: ({ personId, attendanceDate, type }) => appService.saveAbsence(personId, attendanceDate, type),
    onSuccess: async (_data, variables) => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['cycle-data', 'attendance'] })
      const label = variables.type === 'excused' ? 'غياب بإذن' : variables.type === 'unexcused' ? 'غياب بدون إذن' : 'غير محدد'
      feedback.success('تم تحديث نوع الغياب', `تم حفظ الحالة: ${label}.`)
    },
    onError: (err) => {
      const message = err.message || 'تعذر تحديث نوع الغياب'
      setError(message)
      feedback.error('تعذر تحديث الغياب', message)
    },
  })
  const noteMutation = useMutation({
    mutationFn: ({ personId, attendanceDate, note }) => appService.saveAttendanceNote(personId, attendanceDate, note),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['cycle-data', 'attendance'] })
    },
    onError: (err) => {
      const message = err.message || 'تعذر حفظ الملاحظة'
      setError(message)
      feedback.error('تعذر حفظ الملاحظة', message)
    },
  })

  const excelSheets = [{
    name: 'الحضور والغياب',
    rows: filtered.map((row) => ({
      'الشخص': row.person_name,
      'الدور': roleLabels[row.role],
      'التاريخ': date(row.attendance_date),
      'الحالة': attendanceStatusLabel(row),
      'نوع الغياب': row.absence_type === 'excused' ? 'غياب بإذن' : row.absence_type === 'unexcused' ? 'غياب بدون إذن' : '—',
      'الجمعة': row.is_friday ? 'نعم' : 'لا',
      'الملاحظة': row.note || '',
    })),
  }]

  if (query.isLoading) return <div className="page-loader">جاري تحميل الحضور والغياب...</div>
  if (query.isError) return <div className="page-error">{query.error?.message || 'تعذر تحميل الحضور والغياب'}</div>

  return (
    <div className="page-stack attendance-workspace-page">
      <section className="attendance-overview">
        <article className="attendance-overview-card primary">
          <div><span>نسبة الحضور</span><strong>{summary.rate.toFixed(1)}%</strong><small>من الأيام المنتهية في الدورة</small></div>
          <CalendarCheck2 size={22} />
        </article>
        <article className="attendance-overview-card success">
          <div><span>الحضور</span><strong>{summary.present}</strong><small>منها {summary.friday} جمعة</small></div>
          <CalendarCheck2 size={22} />
        </article>
        <article className="attendance-overview-card danger">
          <div><span>الغياب</span><strong>{summary.absent}</strong><small>{summary.excused} بإذن · {summary.unexcused} بدون إذن</small></div>
          <CalendarX2 size={22} />
        </article>
        <article className={`attendance-overview-card ${summary.uncategorized ? 'warning' : 'neutral'}`}>
          <div><span>يحتاج تصنيف</span><strong>{summary.uncategorized}</strong><small>{summary.uncategorized ? 'حالات غياب بدون نوع محدد' : 'كل حالات الغياب مصنفة'}</small></div>
          {summary.uncategorized ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
        </article>
      </section>

      <section className="attendance-quick-filters" aria-label="فلاتر سريعة للحضور">
        <button type="button" className={!status && !absenceFilter ? 'active' : ''} onClick={() => { setStatus(''); setAbsenceFilter('') }}>الكل</button>
        <button type="button" className={status === 'present' && !absenceFilter ? 'active success' : ''} onClick={() => { setStatus('present'); setAbsenceFilter('') }}>الحضور <b>{summary.present}</b></button>
        <button type="button" className={status === 'absent' && !absenceFilter ? 'active danger' : ''} onClick={() => { setStatus('absent'); setAbsenceFilter('') }}>الغياب <b>{summary.absent}</b></button>
        <button type="button" className={absenceFilter === 'excused' ? 'active warning' : ''} onClick={() => { setStatus(''); setAbsenceFilter('excused') }}>بإذن <b>{summary.excused}</b></button>
        <button type="button" className={absenceFilter === 'unexcused' ? 'active danger' : ''} onClick={() => { setStatus(''); setAbsenceFilter('unexcused') }}>بدون إذن <b>{summary.unexcused}</b></button>
        <button type="button" className={absenceFilter === 'uncategorized' ? 'active warning' : ''} onClick={() => { setStatus(''); setAbsenceFilter('uncategorized') }}>يحتاج مراجعة <b>{summary.uncategorized}</b></button>
      </section>

      <section className="panel attendance-panel" ref={exportRef}>
        <div className="filters-bar attendance-filters">
          <div className="input-with-icon grow"><Search size={16} /><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="بحث بالاسم أو التاريخ أو الملاحظة..." /></div>
          <select value={role} onChange={(e) => { setRole(e.target.value); setPerson('') }}><option value="">كل الأدوار</option><option value="engineer">المهندسين</option><option value="technician">الفنيين</option><option value="assistant">المساعدين</option><option value="worker">العمال</option></select>
          <select value={person} onChange={(e) => setPerson(e.target.value)}><option value="">كل الأشخاص</option>{people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setAbsenceFilter('') }}><option value="">كل الحالات</option><option value="present">حاضر</option><option value="absent">غياب</option><option value="upcoming">قادم</option></select>
          <ExportButtons filename={`attendance-${monthKey}`} excelSheets={excelSheets} pdfTarget={exportRef} compact />
        </div>

        {(role || person || status || absenceFilter || queryText) ? (
          <div className="active-filter-bar attendance-active-filters">
            <span>{filtered.length} نتيجة</span>
            <button className="clear-all-filters" type="button" onClick={clearFilters}>مسح الفلاتر <X size={13} /></button>
          </div>
        ) : null}

        {error ? <div className="inline-error">{error}</div> : null}

        <div className="data-table-wrap attendance-table-wrap">
          <table className="data-table attendance-main-table">
            <thead><tr><th>الشخص</th><th>الدور</th><th>التاريخ</th><th>الحالة</th><th>نوع الغياب</th><th>الملاحظة</th></tr></thead>
            <tbody>{filtered.map((row) => {
              const key = `${row.person_id}-${row.attendance_date}`
              return (
                <tr className={row.status === 'absent' ? 'attendance-data-row is-absent' : row.status === 'present' ? 'attendance-data-row is-present' : 'attendance-data-row'} key={key}>
                  <td className="strong-cell attendance-person-cell">{row.person_name}</td>
                  <td>{roleLabels[row.role]}</td>
                  <td>{date(row.attendance_date)} {row.is_friday ? <span className="count-chip">جمعة</span> : null}</td>
                  <td><span className={`status-pill ${row.status === 'present' ? 'success' : row.status === 'absent' ? 'danger' : 'neutral'}`}>{attendanceStatusLabel(row)}</span></td>
                  <td>
                    <select
                      className={row.absence_type === 'unexcused' ? 'absence-select unexcused' : row.absence_type === 'excused' ? 'absence-select excused' : 'absence-select'}
                      disabled={!permissions.canManageAttendance || row.status !== 'absent' || absenceMutation.isPending}
                      value={row.absence_type || ''}
                      onChange={(e) => absenceMutation.mutate({ personId: row.person_id, attendanceDate: row.attendance_date, type: e.target.value })}
                    >
                      <option value="">غير محدد</option>
                      <option value="excused">غياب بإذن</option>
                      <option value="unexcused">غياب بدون إذن</option>
                    </select>
                  </td>
                  <td><AttendanceNoteCell row={row} editable={permissions.canManageAttendance} onSave={(note) => noteMutation.mutateAsync({ personId: row.person_id, attendanceDate: row.attendance_date, note })} /></td>
                </tr>
              )
            })}</tbody>
          </table>

          {!filtered.length ? (
            <EmptyState
              title={rows.length ? 'مفيش حضور مطابق للفلاتر' : 'لسه مفيش بيانات حضور للدورة'}
              description={rows.length ? 'جرّب تمسح الفلاتر أو تغيّر البحث.' : 'بيانات الحضور هتظهر تلقائيًا بمجرد وجود تشغيل في الدورة.'}
              actionLabel={rows.length ? 'مسح الفلاتر' : ''}
              onAction={rows.length ? clearFilters : undefined}
              hint={rows.length ? 'البيانات موجودة لكن الفلاتر الحالية مخفية النتائج.' : 'الحضور مرتبط بعمليات الإنتاجية المسجلة.'}
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}


function AttendanceNoteCell({ row, editable, onSave }) {
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
  }, [row.person_id, row.attendance_date])

  useEffect(() => {
    if (!editable) return undefined
    const next = value.trim()
    if (next === lastSavedRef.current) return undefined

    setState('dirty')
    if (timerRef.current) window.clearTimeout(timerRef.current)

    timerRef.current = window.setTimeout(async () => {
      setState('saving')
      try {
        await onSaveRef.current(next)
        lastSavedRef.current = next
        setState('saved')
      } catch {
        setState('error')
      }
    }, 900)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [editable, row.person_id, row.attendance_date, value])

  if (!editable) return <span>{row.note || '—'}</span>

  return (
    <div className="autosave-note-field">
      <input
        className="table-input"
        value={value}
        maxLength={1000}
        placeholder="اكتب ملاحظة..."
        onChange={(event) => setValue(event.target.value)}
      />
      <small className={state === 'saved' ? 'saved' : state === 'error' ? 'error' : ''}>
        {state === 'saving'
          ? 'جاري الحفظ...'
          : state === 'saved'
            ? 'تم الحفظ ✓'
            : state === 'error'
              ? 'تعذر الحفظ'
              : state === 'dirty'
                ? 'سيتم الحفظ تلقائيًا...'
                : 'يتم الحفظ تلقائيًا'}
      </small>
    </div>
  )
}
