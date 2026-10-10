import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BriefcaseBusiness, CalendarCheck2, CalendarX2, CircleDollarSign, Ruler, Search, RotateCcw } from 'lucide-react'
import { appService } from '../services/appService'
import { date, money, number } from '../lib/format'
import Modal from './Modal'
import EmptyState from './EmptyState'
import ExportButtons from './ExportButtons'
import { smartIncludes } from '../lib/smartSearch'

const statusLabel = (row) => row.status === 'present' ? (row.is_friday ? 'حاضر (جمعة)' : 'حاضر') : row.status === 'absent' ? 'غياب' : 'قادم'
const absenceLabel = (type) => type === 'excused' ? 'غياب بإذن' : type === 'unexcused' ? 'غياب بدون إذن' : '—'

export default function PersonDetailsModal({ person, selectedCycle, monthKey, onClose }) {
  const printRef = useRef(null)
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

  const stats = useMemo(() => ({
    tasks: data.operations.length,
    meters: data.operations.reduce((sum, row) => sum + Number(row.meters || 0), 0),
    earnings: data.operations.reduce((sum, row) => sum + Number(row.share_amount || 0), 0),
    present: data.attendance.filter((row) => row.status === 'present').length,
    absent: data.attendance.filter((row) => row.status === 'absent').length,
    projects: projects.length,
  }), [data, projects.length])

  const projectVisits = useMemo(() => {
    const map = new Map()
    data.operations.forEach((row) => map.set(row.project, (map.get(row.project) || 0) + 1))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [data.operations])

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
    <Modal open={Boolean(person)} title={`تفاصيل العمليات والحضور — ${person?.name || ''}`} onClose={onClose} width="xl">
      {query.isLoading ? <div className="page-loader">جاري تحميل التفاصيل الكاملة...</div> : query.isError ? <div className="page-error">{query.error?.message || 'تعذر تحميل تفاصيل الشخص'}</div> : (
        <div className="person-details-report" ref={printRef}>
          <section className="details-summary-grid">
            <div><BriefcaseBusiness /><span>العمليات</span><strong>{number(stats.tasks)}</strong></div>
            <div><Ruler /><span>الأمتار</span><strong>{number(stats.meters)} م</strong></div>
            <div><CircleDollarSign /><span>المستحق</span><strong>{money(stats.earnings)}</strong></div>
            <div><CalendarCheck2 /><span>الحضور</span><strong>{number(stats.present)}</strong></div>
            <div><CalendarX2 /><span>الغياب</span><strong>{number(stats.absent)}</strong></div>
            <div><BriefcaseBusiness /><span>المشاريع</span><strong>{number(stats.projects)}</strong></div>
          </section>

          <section className="details-toolbar no-pdf-break">
            <div className="input-with-icon grow"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في التاريخ، المشروع، القطاع، الشركاء أو الملاحظات..." /></div>
            <select value={project} onChange={(e) => setProject(e.target.value)}><option value="">كل المشاريع</option>{projects.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={section} onChange={(e) => setSection(e.target.value)}><option value="">كل القطاعات</option>{sections.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={attendanceStatus} onChange={(e) => setAttendanceStatus(e.target.value)}><option value="">كل حالات الحضور</option><option value="present">حاضر</option><option value="absent">غياب</option><option value="upcoming">قادم</option></select>
            <label className="details-date-filter"><span>من</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
            <label className="details-date-filter"><span>إلى</span><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
            <button className="btn btn-ghost btn-sm clear-filters-btn" type="button" onClick={() => { setSearch(''); setProject(''); setSection(''); setAttendanceStatus(''); setFromDate(''); setToDate('') }}><RotateCcw size={15} /> مسح الفلاتر</button>
            <ExportButtons filename={`${person?.name || 'person'}-${monthKey}-details`} excelSheets={excelSheets} pdfTarget={printRef} compact />
          </section>

          <section className="visited-projects no-pdf-break">
            <div className="subsection-title"><h4>المشاريع التي عمل بها</h4><span>{projectVisits.length} مشروع</span></div>
            <div className="project-chip-list">{projectVisits.map(([name, count]) => <button type="button" className={`project-chip ${project === name ? 'active' : ''}`} key={name} onClick={() => setProject(project === name ? '' : name)}><span>{name}</span><b>{count} عملية</b></button>)}</div>
          </section>

          <section className="details-section">
            <div className="subsection-title"><h4>تفاصيل العمليات</h4><span>{filteredOperations.length} نتيجة</span></div>
            <div className="data-table-wrap compact-table">
              <table className="data-table readable-table"><thead><tr><th>التاريخ</th><th>المشروع</th><th>القطاع</th><th>الأمتار</th><th>النصيب</th><th>الشركاء</th><th>ملاحظة العملية</th></tr></thead><tbody>{filteredOperations.map((row, index) => <tr key={`${row.work_date}-${row.project}-${index}`}><td>{date(row.work_date)}</td><td className="strong-cell">{row.project}</td><td>{row.section}</td><td>{number(row.meters)}</td><td>{money(row.share_amount)}</td><td>{row.partners || '—'}</td><td className="note-cell operation-note-cell">{row.note || '—'}</td></tr>)}</tbody></table>
              {!filteredOperations.length ? <EmptyState title="لا توجد عمليات مطابقة للفلتر" /> : null}
            </div>
          </section>

          <section className="details-section">
            <div className="subsection-title"><h4>الحضور والغياب</h4><span>{filteredAttendance.length} يوم</span></div>
            <div className="data-table-wrap compact-table">
              <table className="data-table readable-table"><thead><tr><th>التاريخ</th><th>الحالة</th><th>نوع الغياب</th><th>اليوم</th><th>الملاحظة</th></tr></thead><tbody>{filteredAttendance.map((row) => <tr key={row.attendance_date}><td>{date(row.attendance_date)}</td><td><span className={`status-pill ${row.status === 'present' ? 'success' : row.status === 'absent' ? 'danger' : 'neutral'}`}>{statusLabel(row)}</span></td><td>{absenceLabel(row.absence_type)}</td><td>{row.is_friday ? 'جمعة' : 'يوم عمل'}</td><td className="note-cell">{row.note || '—'}</td></tr>)}</tbody></table>
              {!filteredAttendance.length ? <EmptyState title="لا توجد أيام مطابقة للفلتر" /> : null}
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}
