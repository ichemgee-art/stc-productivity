import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BriefcaseBusiness, CalendarCheck2, CalendarX2, CircleDollarSign, Ruler, Search, RotateCcw } from 'lucide-react'
import { appService } from '../services/appService'
import { date, money, number, roleLabels } from '../lib/format'
import Modal from './Modal'
import EmptyState from './EmptyState'
import ExportButtons from './ExportButtons'
import { smartIncludes } from '../lib/smartSearch'

const statusLabel = (row) => row.status === 'present' ? (row.is_friday ? 'حاضر (جمعة)' : 'حاضر') : row.status === 'absent' ? 'غياب' : 'قادم'
const absenceLabel = (type) => type === 'excused' ? 'غياب بإذن' : type === 'unexcused' ? 'غياب بدون إذن' : '—'

export default function PersonDetailsModal({ person, selectedCycle, monthKey, onClose }) {
  const printRef = useRef(null)
  const [activeTab, setActiveTab] = useState('operations')
  const [search, setSearch] = useState('')
  const [project, setProject] = useState('')
  const [section, setSection] = useState('')
  const [attendanceStatus, setAttendanceStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const query = useQuery({
    queryKey: ['person-full-details', person?.id, monthKey],
    queryFn: async () => {
      const [operations, attendance] = await Promise.all([
        appService.personOperations(person.id, selectedCycle.cycle_start, selectedCycle.cycle_end),
        appService.attendance(monthKey),
      ])
      return {
        operations,
        attendance: attendance.filter((row) => row.person_id === person.id),
      }
    },
    enabled: Boolean(person && selectedCycle && monthKey),
  })

  const data = query.data || { operations: [], attendance: [] }
  const projects = useMemo(() => [...new Set(data.operations.map((row) => row.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [data.operations])
  const sections = useMemo(() => [...new Set(data.operations.map((row) => row.section).filter(Boolean))].sort(), [data.operations])

  const filteredOperations = useMemo(() => data.operations.filter((row) => {
    if (project && row.project !== project) return false
    if (section && row.section !== section) return false
    if (fromDate && row.work_date < fromDate) return false
    if (toDate && row.work_date > toDate) return false
    if (!smartIncludes(search, row.work_date, row.project, row.section, row.partners, row.meters, row.share_amount, row.note)) return false
    return true
  }), [data.operations, project, section, search, fromDate, toDate])

  const filteredAttendance = useMemo(() => data.attendance.filter((row) => {
    if (attendanceStatus && row.status !== attendanceStatus) return false
    if (fromDate && row.attendance_date < fromDate) return false
    if (toDate && row.attendance_date > toDate) return false
    if (!smartIncludes(search, row.attendance_date, statusLabel(row), absenceLabel(row.absence_type), row.note)) return false
    return true
  }), [data.attendance, attendanceStatus, search, fromDate, toDate])

  const stats = useMemo(() => {
    const present = data.attendance.filter((row) => row.status === 'present').length
    const absent = data.attendance.filter((row) => row.status === 'absent').length
    const completedDays = present + absent
    return {
      tasks: data.operations.length,
      meters: data.operations.reduce((sum, row) => sum + Number(row.meters || 0), 0),
      earnings: data.operations.reduce((sum, row) => sum + Number(row.share_amount || 0), 0),
      present,
      absent,
      excused: data.attendance.filter((row) => row.status === 'absent' && row.absence_type === 'excused').length,
      unexcused: data.attendance.filter((row) => row.status === 'absent' && row.absence_type === 'unexcused').length,
      fridayPresent: data.attendance.filter((row) => row.status === 'present' && row.is_friday).length,
      upcoming: data.attendance.filter((row) => row.status === 'upcoming').length,
      attendanceRate: completedDays ? (present / completedDays) * 100 : 0,
      projects: projects.length,
    }
  }, [data, projects.length])

  const filteredOperationsTotal = useMemo(
    () => filteredOperations.reduce((sum, row) => sum + Number(row.share_amount || 0), 0),
    [filteredOperations],
  )

  const projectVisits = useMemo(() => {
    const map = new Map()
    data.operations.forEach((row) => map.set(row.project, (map.get(row.project) || 0) + 1))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [data.operations])

  const absenceBreakdown = useMemo(() => ({
    excused: data.attendance.filter((row) => row.status === 'absent' && row.absence_type === 'excused'),
    unexcused: data.attendance.filter((row) => row.status === 'absent' && row.absence_type === 'unexcused'),
  }), [data.attendance])

  const clearFilters = () => {
    setSearch('')
    setProject('')
    setSection('')
    setAttendanceStatus('')
    setFromDate('')
    setToDate('')
  }

  const excelSheets = [
    {
      name: 'العمليات',
      rows: filteredOperations.map((row) => ({
        'التاريخ': date(row.work_date),
        'المشروع': row.project || '—',
        'القطاع': row.section || '—',
        'الأمتار': Number(row.meters || 0),
        'النصيب': Number(row.share_amount || 0),
        'الشركاء': row.partners || '—',
        'ملاحظة العملية': row.note || '',
      })),
    },
    {
      name: 'الحضور والغياب',
      rows: filteredAttendance.map((row) => ({
        'التاريخ': date(row.attendance_date),
        'الحالة': statusLabel(row),
        'نوع الغياب': absenceLabel(row.absence_type),
        'الجمعة': row.is_friday ? 'نعم' : 'لا',
        'الملاحظة': row.note || '',
      })),
    },
  ]

  return (
    <Modal open={Boolean(person)} title={`ملف الموظف — ${person?.name || ''}`} onClose={onClose} width="hr">
      {query.isLoading ? <div className="page-loader">جاري تحميل ملف الموظف...</div> : query.isError ? <div className="page-error">{query.error?.message || 'تعذر تحميل تفاصيل الشخص'}</div> : (
        <div className="person-details-report hr-person-report" ref={printRef}>
          <section className="hr-person-hero no-pdf-break">
            <div className="hr-person-profile">
              <div className="hr-person-avatar">{(person?.name || 'م').trim().charAt(0)}</div>
              <div className="hr-person-copy">
                <span className="hr-eyebrow">ملخص الموارد البشرية</span>
                <h2>{person?.name}</h2>
                <div className="hr-person-meta">
                  <span>{roleLabels[person?.role] || person?.role || 'موظف'}</span>
                  <span>{date(selectedCycle?.cycle_start)} — {date(selectedCycle?.cycle_end)}</span>
                </div>
              </div>
            </div>

            <div className="hr-due-card">
              <span>إجمالي المستحق للدورة</span>
              <strong>{money(stats.earnings)}</strong>
              <small>{number(stats.tasks)} عملية · {number(stats.meters)} م</small>
            </div>
          </section>

          <section className="hr-kpi-grid no-pdf-break">
            <article className="hr-kpi-card attendance-rate">
              <div className="hr-kpi-icon"><CalendarCheck2 size={21} /></div>
              <div>
                <span>نسبة الحضور</span>
                <strong>{number(stats.attendanceRate, 1)}%</strong>
                <small>من الأيام المنتهية في الدورة</small>
              </div>
            </article>

            <article className="hr-kpi-card success">
              <div className="hr-kpi-icon"><CalendarCheck2 size={21} /></div>
              <div>
                <span>أيام الحضور</span>
                <strong>{number(stats.present)}</strong>
                <small>منها {number(stats.fridayPresent)} جمعة</small>
              </div>
            </article>

            <article className="hr-kpi-card danger">
              <div className="hr-kpi-icon"><CalendarX2 size={21} /></div>
              <div>
                <span>أيام الغياب</span>
                <strong>{number(stats.absent)}</strong>
                <small>{number(stats.excused)} بإذن · {number(stats.unexcused)} بدون إذن</small>
              </div>
            </article>

            <article className="hr-kpi-card">
              <div className="hr-kpi-icon"><BriefcaseBusiness size={21} /></div>
              <div>
                <span>العمليات</span>
                <strong>{number(stats.tasks)}</strong>
                <small>في {number(stats.projects)} مشروع</small>
              </div>
            </article>

            <article className="hr-kpi-card">
              <div className="hr-kpi-icon"><Ruler size={21} /></div>
              <div>
                <span>إجمالي الأمتار</span>
                <strong>{number(stats.meters)} م</strong>
                <small>{stats.upcoming ? `${number(stats.upcoming)} يوم قادم بالدورة` : 'الدورة مكتملة حتى اليوم'}</small>
              </div>
            </article>
          </section>

          <section className="hr-tabs no-pdf-break" aria-label="أقسام ملف الموظف">
            <button type="button" className={activeTab === 'operations' ? 'active' : ''} onClick={() => setActiveTab('operations')}>
              العمليات والمستحقات
              <span>{number(data.operations.length)}</span>
            </button>
            <button type="button" className={activeTab === 'attendance' ? 'active' : ''} onClick={() => setActiveTab('attendance')}>
              الحضور والغياب
              <span>{number(data.attendance.length)}</span>
            </button>
          </section>

          <section className="details-toolbar hr-details-toolbar no-pdf-break">
            <div className="hr-filter-search">
              <span>بحث</span>
              <div className="input-with-icon"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={activeTab === 'operations' ? 'مشروع، قطاع، شريك أو ملاحظة...' : 'تاريخ، حالة أو ملاحظة...'} /></div>
            </div>

            {activeTab === 'operations' ? (
              <>
                <label className="hr-filter-field"><span>المشروع</span><select value={project} onChange={(e) => setProject(e.target.value)}><option value="">كل المشاريع</option>{projects.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="hr-filter-field"><span>القطاع</span><select value={section} onChange={(e) => setSection(e.target.value)}><option value="">كل القطاعات</option>{sections.map((item) => <option key={item}>{item}</option>)}</select></label>
              </>
            ) : (
              <label className="hr-filter-field"><span>الحالة</span><select value={attendanceStatus} onChange={(e) => setAttendanceStatus(e.target.value)}><option value="">كل الحالات</option><option value="present">حاضر</option><option value="absent">غياب</option><option value="upcoming">قادم</option></select></label>
            )}

            <label className="hr-filter-field hr-date-field"><span>من</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
            <label className="hr-filter-field hr-date-field"><span>إلى</span><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>

            <div className="hr-toolbar-actions">
              <button className="btn btn-ghost btn-sm clear-filters-btn" type="button" onClick={clearFilters}><RotateCcw size={15} /> مسح الفلاتر</button>
              <ExportButtons filename={`${person?.name || 'person'}-${monthKey}-details`} excelSheets={excelSheets} pdfTarget={printRef} compact />
            </div>
          </section>

          {activeTab === 'operations' ? (
            <>
              <section className="visited-projects hr-visited-projects no-pdf-break">
                <div className="subsection-title hr-subsection-title">
                  <div>
                    <h4>المشاريع التي عمل بها</h4>
                    <p>اضغط على أي مشروع لتصفية العمليات مباشرة.</p>
                  </div>
                  <span>{projectVisits.length} مشروع</span>
                </div>
                <div className="project-chip-list">{projectVisits.map(([name, count]) => <button type="button" className={`project-chip ${project === name ? 'active' : ''}`} key={name} onClick={() => setProject(project === name ? '' : name)}><span>{name}</span><b>{count} عملية</b></button>)}</div>
              </section>

              <section className="details-section hr-details-section">
                <div className="subsection-title hr-subsection-title">
                  <div>
                    <h4>تفاصيل العمليات والمستحقات</h4>
                    <p>كل عملية ساهمت في مستحق الموظف خلال الدورة.</p>
                  </div>
                  <div className="hr-section-total">
                    <span>{filteredOperations.length} نتيجة</span>
                    <strong>{money(filteredOperationsTotal)}</strong>
                  </div>
                </div>
                <div className="data-table-wrap compact-table hr-table-wrap">
                  <table className="data-table readable-table hr-readable-table"><thead><tr><th>التاريخ</th><th>المشروع</th><th>القطاع</th><th>الأمتار</th><th>المستحق</th><th>الشركاء</th><th>ملاحظة العملية</th></tr></thead><tbody>{filteredOperations.map((row, index) => <tr key={`${row.work_date}-${row.project}-${index}`}><td className="hr-date-cell">{date(row.work_date)}</td><td className="strong-cell">{row.project}</td><td>{row.section}</td><td>{number(row.meters)}</td><td><strong className="hr-money-cell">{money(row.share_amount)}</strong></td><td>{row.partners || '—'}</td><td className="note-cell operation-note-cell">{row.note || '—'}</td></tr>)}</tbody></table>
                  {!filteredOperations.length ? <EmptyState title="لا توجد عمليات مطابقة للفلتر" /> : null}
                </div>
              </section>
            </>
          ) : (
            <section className="details-section hr-details-section">
              <div className="subsection-title hr-subsection-title">
                <div>
                  <h4>سجل الحضور والغياب</h4>
                  <p>الحضور، الغياب بإذن وبدون إذن، والجمعة موضحين بشكل مباشر للـHR.</p>
                </div>
                <span>{filteredAttendance.length} يوم</span>
              </div>

              <div className="hr-attendance-legend no-pdf-break">
                <span className="legend-present">حاضر: {number(stats.present)}</span>
                <span className="legend-excused">غياب بإذن: {number(stats.excused)}</span>
                <span className="legend-unexcused">غياب بدون إذن: {number(stats.unexcused)}</span>
                <span className="legend-upcoming">قادم: {number(stats.upcoming)}</span>
              </div>

              <div className="hr-absence-overview no-pdf-break">
                <article className="hr-absence-card excused">
                  <header>
                    <div>
                      <span>الغياب بإذن</span>
                      <small>التواريخ والملاحظات المسجلة</small>
                    </div>
                    <strong>{number(absenceBreakdown.excused.length)}</strong>
                  </header>
                  <div className="hr-absence-days">
                    {absenceBreakdown.excused.length ? absenceBreakdown.excused.map((row) => (
                      <div className="hr-absence-day" key={`excused-${row.attendance_date}`}>
                        <b>{date(row.attendance_date)}</b>
                        <p>{row.note || 'لا توجد ملاحظة مسجلة'}</p>
                      </div>
                    )) : <div className="hr-absence-empty">لا يوجد غياب بإذن في هذه الدورة.</div>}
                  </div>
                </article>

                <article className="hr-absence-card unexcused">
                  <header>
                    <div>
                      <span>الغياب بدون إذن</span>
                      <small>التواريخ والملاحظات المسجلة</small>
                    </div>
                    <strong>{number(absenceBreakdown.unexcused.length)}</strong>
                  </header>
                  <div className="hr-absence-days">
                    {absenceBreakdown.unexcused.length ? absenceBreakdown.unexcused.map((row) => (
                      <div className="hr-absence-day" key={`unexcused-${row.attendance_date}`}>
                        <b>{date(row.attendance_date)}</b>
                        <p>{row.note || 'لا توجد ملاحظة مسجلة'}</p>
                      </div>
                    )) : <div className="hr-absence-empty">لا يوجد غياب بدون إذن في هذه الدورة.</div>}
                  </div>
                </article>
              </div>

              <div className="data-table-wrap compact-table hr-table-wrap">
                <table className="data-table readable-table hr-readable-table attendance-table"><thead><tr><th>التاريخ</th><th>الحالة</th><th>نوع الغياب</th><th>اليوم</th><th>ملاحظة HR</th></tr></thead><tbody>{filteredAttendance.map((row) => <tr className={row.status === 'absent' ? 'attendance-row is-absent' : row.status === 'present' ? 'attendance-row is-present' : 'attendance-row'} key={row.attendance_date}><td className="hr-date-cell">{date(row.attendance_date)}</td><td><span className={`status-pill ${row.status === 'present' ? 'success' : row.status === 'absent' ? 'danger' : 'neutral'}`}>{statusLabel(row)}</span></td><td className={row.absence_type === 'unexcused' ? 'hr-absence-unexcused' : row.absence_type === 'excused' ? 'hr-absence-excused' : ''}>{absenceLabel(row.absence_type)}</td><td>{row.is_friday ? <span className="friday-label">جمعة</span> : 'يوم عمل'}</td><td className="note-cell">{row.note || '—'}</td></tr>)}</tbody></table>
                {!filteredAttendance.length ? <EmptyState title="لا توجد أيام مطابقة للفلتر" /> : null}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
