import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, CalendarCheck2, CircleDollarSign, FileSpreadsheet, Printer,
  Ruler, TrendingUp, Users, BriefcaseBusiness, Layers3, CalendarRange,
  Search, SlidersHorizontal, RotateCcw,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useCycle } from '../context/CycleContext'
import { useFeedback } from '../context/FeedbackContext'
import { appService } from '../services/appService'
import { exportExecutiveExcel } from '../lib/exporters'
import { date, money, monthName, number, roleLabels } from '../lib/format'
import { smartIncludes } from '../lib/smartSearch'

const chartTooltipStyle = {
  borderRadius: 12,
  border: '1px solid rgba(37,58,85,.16)',
  boxShadow: '0 10px 30px rgba(37,58,85,.12)',
  fontFamily: 'Cairo',
  fontSize: 12,
}

const sumRows = (rows) => {
  const operations = rows.length
  const meters = rows.reduce((sum, row) => sum + Number(row.meters || 0), 0)
  const revenue = rows.reduce((sum, row) => sum + Number(row.total || 0), 0)
  return {
    operations,
    meters,
    revenue,
    avgPrice: meters > 0 ? revenue / meters : 0,
  }
}

const sumAttendance = (rows) => {
  const effective = rows.filter((row) => row.status !== 'upcoming' && !row.is_friday)
  const present = effective.filter((row) => row.status === 'present').length
  const absent = effective.filter((row) => row.status === 'absent').length
  const total = present + absent
  return {
    present,
    absent,
    rate: total > 0 ? (present / total) * 100 : 0,
  }
}

const groupRows = (cyclesData, key) => {
  const map = new Map()
  cyclesData.forEach((cycle) => {
    cycle.rows.forEach((row) => {
      const name = row[key] || 'بدون'
      const current = map.get(name) || {
        name,
        operations: 0,
        meters: 0,
        revenue: 0,
        byCycle: {},
      }
      current.operations += 1
      current.meters += Number(row.meters || 0)
      current.revenue += Number(row.total || 0)
      const cycleCurrent = current.byCycle[cycle.monthKey] || { operations: 0, meters: 0, revenue: 0 }
      cycleCurrent.operations += 1
      cycleCurrent.meters += Number(row.meters || 0)
      cycleCurrent.revenue += Number(row.total || 0)
      current.byCycle[cycle.monthKey] = cycleCurrent
      map.set(name, current)
    })
  })
  return [...map.values()].sort((a, b) => b.meters - a.meters)
}

const aggregatePeople = (cyclesData) => {
  const map = new Map()
  cyclesData.forEach((cycle) => {
    cycle.peopleOps.forEach((row) => {
      const key = row.person_id
      const current = map.get(key) || {
        person_id: row.person_id,
        person_name: row.person_name,
        role: row.role,
        meters: 0,
        earnings: 0,
        operations: new Set(),
        byCycle: {},
      }
      current.meters += Number(row.meters || 0)
      current.earnings += Number(row.share_amount || 0)
      current.operations.add(row.submission_id)
      const cycleCurrent = current.byCycle[cycle.monthKey] || { meters: 0, earnings: 0, operations: new Set() }
      cycleCurrent.meters += Number(row.meters || 0)
      cycleCurrent.earnings += Number(row.share_amount || 0)
      cycleCurrent.operations.add(row.submission_id)
      current.byCycle[cycle.monthKey] = cycleCurrent
      map.set(key, current)
    })
  })

  return [...map.values()]
    .map((row) => ({
      ...row,
      operationsCount: row.operations.size,
      byCycle: Object.fromEntries(Object.entries(row.byCycle).map(([monthKey, item]) => [
        monthKey,
        { meters: item.meters, earnings: item.earnings, operations: item.operations.size },
      ])),
    }))
    .sort((a, b) => b.earnings - a.earnings)
}

function Kpi({ icon: Icon, label, value, helper }) {
  return (
    <div>
      <Icon size={19} />
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

export default function QuarterReportPage() {
  const { cycles } = useCycle()
  const feedback = useFeedback()
  const [selectedKeys, setSelectedKeys] = useState(['', '', ''])
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({
    search: '',
    cycle: '',
    dateFrom: '',
    dateTo: '',
    project: '',
    section: '',
    personId: '',
    role: '',
    review: '',
    attendanceStatus: '',
    absenceType: '',
  })

  useEffect(() => {
    if (cycles.length >= 3 && selectedKeys.every((value) => !value)) {
      setSelectedKeys(cycles.slice(0, 3).map((cycle) => cycle.month_key))
    }
  }, [cycles, selectedKeys])

  const selectedCycles = useMemo(() => {
    const map = new Map(cycles.map((cycle) => [cycle.month_key, cycle]))
    return selectedKeys
      .map((key) => map.get(key))
      .filter(Boolean)
      .sort((a, b) => String(a.cycle_start).localeCompare(String(b.cycle_start)))
  }, [cycles, selectedKeys])

  const validSelection = selectedCycles.length === 3 && new Set(selectedKeys).size === 3

  const query = useQuery({
    queryKey: ['quarter-report', selectedKeys.join('|')],
    enabled: validSelection,
    queryFn: async () => Promise.all(selectedCycles.map(async (cycle) => {
      const [rows, attendance, peopleOps] = await Promise.all([
        appService.productivityRows(cycle.cycle_start, cycle.cycle_end),
        appService.attendance(cycle.month_key),
        appService.cyclePersonOperations(cycle.cycle_start, cycle.cycle_end),
      ])

      const summary = sumRows(rows)
      const attendanceSummary = sumAttendance(attendance)
      const labor = peopleOps.reduce((sum, row) => sum + Number(row.share_amount || 0), 0)
      const peopleCount = new Set(peopleOps.map((row) => row.person_id).filter(Boolean)).size

      return {
        monthKey: cycle.month_key,
        cycle,
        rows,
        attendance,
        peopleOps,
        summary,
        attendanceSummary,
        labor,
        peopleCount,
      }
    })),
  })

  const filterOptions = useMemo(() => {
    const cyclesData = query.data || []
    const projects = [...new Set(cyclesData.flatMap((cycle) => cycle.rows.map((row) => row.project)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'))
    const sections = [...new Set(cyclesData.flatMap((cycle) => cycle.rows.map((row) => row.section)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'))
    const peopleMap = new Map()
    cyclesData.flatMap((cycle) => cycle.peopleOps).forEach((row) => {
      if (row.person_id && !peopleMap.has(String(row.person_id))) {
        peopleMap.set(String(row.person_id), { id: String(row.person_id), name: row.person_name || '—', role: row.role })
      }
    })
    const people = [...peopleMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    const roles = [...new Set(cyclesData.flatMap((cycle) => cycle.peopleOps.map((row) => row.role)).filter(Boolean))]
    return { projects, sections, people, roles }
  }, [filteredCyclesData])

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))

  const resetFilters = () => setFilters({
    search: '',
    cycle: '',
    dateFrom: '',
    dateTo: '',
    project: '',
    section: '',
    personId: '',
    role: '',
    review: '',
    attendanceStatus: '',
    absenceType: '',
  })

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => String(value || '').trim()).length,
    [filters],
  )

  useEffect(() => {
    if (filters.cycle && !selectedKeys.includes(filters.cycle)) {
      setFilters((current) => ({ ...current, cycle: '' }))
    }
  }, [filters.cycle, selectedKeys])

  const filteredCyclesData = useMemo(() => {
    if (!query.data?.length) return []

    return query.data.map((cycle) => {
      const cycleEnabled = !filters.cycle || filters.cycle === cycle.monthKey
      if (!cycleEnabled) {
        return {
          ...cycle,
          rows: [],
          peopleOps: [],
          attendance: [],
          summary: sumRows([]),
          attendanceSummary: sumAttendance([]),
          labor: 0,
          peopleCount: 0,
        }
      }

      const inDateRange = (value) => {
        const raw = String(value || '').slice(0, 10)
        if (filters.dateFrom && raw < filters.dateFrom) return false
        if (filters.dateTo && raw > filters.dateTo) return false
        return true
      }

      const baseRows = cycle.rows.filter((row) => {
        if (!inDateRange(row.work_date)) return false
        if (filters.project && row.project !== filters.project) return false
        if (filters.section && row.section !== filters.section) return false
        if (filters.review && row.review_status !== filters.review) return false
        if (filters.search && !smartIncludes(
          filters.search,
          row.work_date,
          row.project,
          row.section,
          row.engineers,
          row.technicians,
          row.assistants,
          row.workers,
          row.meters,
          row.price_per_meter,
          row.total,
          row.note,
          row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم المراجعة',
        )) return false
        return true
      })

      const baseRowIds = new Set(baseRows.map((row) => String(row.id)))
      const basePeopleOps = cycle.peopleOps.filter((row) => baseRowIds.has(String(row.submission_id)))

      let rows = baseRows
      if (filters.personId || filters.role) {
        const matchingSubmissionIds = new Set(
          basePeopleOps
            .filter((row) => (!filters.personId || String(row.person_id) === filters.personId) && (!filters.role || row.role === filters.role))
            .map((row) => String(row.submission_id)),
        )
        rows = baseRows.filter((row) => matchingSubmissionIds.has(String(row.id)))
      }

      const finalRowIds = new Set(rows.map((row) => String(row.id)))
      const allPeopleForRows = cycle.peopleOps.filter((row) => finalRowIds.has(String(row.submission_id)))
      const peopleOps = allPeopleForRows.filter((row) => {
        if (filters.personId && String(row.person_id) !== filters.personId) return false
        if (filters.role && row.role !== filters.role) return false
        return true
      })

      const relevantPersonIds = new Set(allPeopleForRows.map((row) => String(row.person_id)))
      const operationScopeActive = Boolean(filters.project || filters.section || filters.review || filters.search)

      const attendance = cycle.attendance.filter((row) => {
        if (!inDateRange(row.attendance_date)) return false
        if (filters.personId && String(row.person_id) !== filters.personId) return false
        if (filters.role && row.role !== filters.role) return false
        if (filters.attendanceStatus && row.status !== filters.attendanceStatus) return false
        if (filters.absenceType && row.absence_type !== filters.absenceType) return false
        if (operationScopeActive && relevantPersonIds.size && !relevantPersonIds.has(String(row.person_id))) {
          const attendanceSearchMatch = filters.search && smartIncludes(
            filters.search,
            row.person_name,
            roleLabels[row.role] || row.role,
            row.attendance_date,
            row.note,
            row.status === 'present' ? 'حاضر' : row.status === 'absent' ? 'غياب' : 'قادم',
            row.absence_type === 'excused' ? 'بإذن' : row.absence_type === 'unexcused' ? 'بدون إذن' : '',
          )
          if (!attendanceSearchMatch) return false
        } else if (filters.search && !operationScopeActive && !smartIncludes(
          filters.search,
          row.person_name,
          roleLabels[row.role] || row.role,
          row.attendance_date,
          row.note,
        )) return false
        return true
      })

      const summary = sumRows(rows)
      const attendanceSummary = sumAttendance(attendance)
      const labor = peopleOps.reduce((sum, row) => sum + Number(row.share_amount || 0), 0)
      const peopleCount = new Set(peopleOps.map((row) => row.person_id).filter(Boolean)).size

      return {
        ...cycle,
        rows,
        attendance,
        peopleOps,
        summary,
        attendanceSummary,
        labor,
        peopleCount,
      }
    })
  }, [query.data, filters])


  const report = useMemo(() => {
    if (!filteredCyclesData.length) return null
    const cyclesData = filteredCyclesData
    const operations = cyclesData.reduce((sum, cycle) => sum + cycle.summary.operations, 0)
    const meters = cyclesData.reduce((sum, cycle) => sum + cycle.summary.meters, 0)
    const revenue = cyclesData.reduce((sum, cycle) => sum + cycle.summary.revenue, 0)
    const labor = cyclesData.reduce((sum, cycle) => sum + cycle.labor, 0)
    const present = cyclesData.reduce((sum, cycle) => sum + cycle.attendanceSummary.present, 0)
    const absent = cyclesData.reduce((sum, cycle) => sum + cycle.attendanceSummary.absent, 0)
    const attendanceRate = present + absent > 0 ? (present / (present + absent)) * 100 : 0

    const projects = groupRows(cyclesData, 'project')
    const sections = groupRows(cyclesData, 'section')
    const people = aggregatePeople(cyclesData)
    const uniquePeople = new Set(cyclesData.flatMap((cycle) => cycle.peopleOps.map((row) => row.person_id).filter(Boolean))).size

    const cycleRows = cyclesData.map((cycle) => ({
      monthKey: cycle.monthKey,
      label: monthName(cycle.monthKey),
      operations: cycle.summary.operations,
      meters: cycle.summary.meters,
      revenue: cycle.summary.revenue,
      avgPrice: cycle.summary.avgPrice,
      labor: cycle.labor,
      attendanceRate: cycle.attendanceSummary.rate,
      present: cycle.attendanceSummary.present,
      absent: cycle.attendanceSummary.absent,
      peopleCount: cycle.peopleCount,
    }))

    return {
      cyclesData,
      cycleRows,
      operations,
      meters,
      revenue,
      avgPrice: meters > 0 ? revenue / meters : 0,
      labor,
      present,
      absent,
      attendanceRate,
      uniquePeople,
      projects,
      sections,
      people,
      topCycle: [...cycleRows].sort((a, b) => b.meters - a.meters)[0] || null,
      topProject: projects[0] || null,
      topSection: sections[0] || null,
      topPerson: people[0] || null,
    }
  }, [query.data])

  const setSlot = (index, value) => {
    setSelectedKeys((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
  }

  if (cycles.length < 3) {
    return <div className="page-error">حساب الكوارتر يحتاج 3 دورات على الأقل. المتاح حاليًا {cycles.length} فقط.</div>
  }

  const cycleLabels = selectedCycles.map((cycle) => monthName(cycle.month_key))
  const titleRange = cycleLabels.join(' · ')

  const excelSheets = report ? [
    {
      name: 'ملخص الكوارتر',
      rows: [{
        'الدورات': titleRange,
        'عدد العمليات': report.operations,
        'إجمالي الأمتار': report.meters,
        'قيمة الإنتاجية': report.revenue,
        'متوسط سعر المتر': report.avgPrice,
        'مستحقات الفريق': report.labor,
        'نسبة الحضور %': report.attendanceRate,
        'أفراد شاركوا في التنفيذ': report.uniquePeople,
      }],
    },
    {
      name: 'مقارنة الدورات',
      rows: report.cycleRows.map((row) => ({
        'الدورة': row.label,
        'العمليات': row.operations,
        'الأمتار': row.meters,
        'قيمة الإنتاجية': row.revenue,
        'متوسط سعر المتر': row.avgPrice,
        'مستحقات الفريق': row.labor,
        'نسبة الحضور %': row.attendanceRate,
        'الحضور': row.present,
        'الغياب': row.absent,
        'أفراد التنفيذ': row.peopleCount,
      })),
    },
    {
      name: 'المشاريع',
      rows: report.projects.map((row) => ({
        'المشروع': row.name,
        'العمليات': row.operations,
        'الأمتار': row.meters,
        'قيمة الإنتاجية': row.revenue,
        'متوسط / متر': row.meters > 0 ? row.revenue / row.meters : 0,
        ...Object.fromEntries(selectedCycles.map((cycle) => [
          `${monthName(cycle.month_key)} - أمتار`,
          Number(row.byCycle[cycle.month_key]?.meters || 0),
        ])),
      })),
    },
    {
      name: 'القطاعات',
      rows: report.sections.map((row) => ({
        'القطاع': row.name,
        'العمليات': row.operations,
        'الأمتار': row.meters,
        'قيمة الإنتاجية': row.revenue,
        'متوسط / متر': row.meters > 0 ? row.revenue / row.meters : 0,
        ...Object.fromEntries(selectedCycles.map((cycle) => [
          `${monthName(cycle.month_key)} - أمتار`,
          Number(row.byCycle[cycle.month_key]?.meters || 0),
        ])),
      })),
    },
    {
      name: 'أداء الأفراد',
      rows: report.people.map((row) => ({
        'الاسم': row.person_name || '—',
        'الدور': roleLabels[row.role] || row.role || '—',
        'العمليات': row.operationsCount,
        'الأمتار': row.meters,
        'المستحقات': row.earnings,
        ...Object.fromEntries(selectedCycles.map((cycle) => [
          `${monthName(cycle.month_key)} - مستحقات`,
          Number(row.byCycle[cycle.month_key]?.earnings || 0),
        ])),
      })),
    },
    {
      name: 'الحضور والغياب',
      rows: report.cyclesData.flatMap((cycle) => cycle.attendance.map((row) => ({
        'الدورة': monthName(cycle.monthKey),
        'الاسم': row.person_name || '—',
        'الدور': roleLabels[row.role] || row.role || '—',
        'التاريخ': date(row.attendance_date),
        'الحالة': row.status === 'present' ? 'حاضر' : row.status === 'absent' ? 'غياب' : 'قادم',
        'نوع الغياب': row.absence_type === 'excused' ? 'بإذن' : row.absence_type === 'unexcused' ? 'بدون إذن' : '—',
        'الملاحظات': row.note || '',
      }))),
    },
    {
      name: 'العمليات كاملة',
      rows: report.cyclesData.flatMap((cycle) => cycle.rows.map((row, index) => ({
        'الدورة': monthName(cycle.monthKey),
        '#': index + 1,
        'التاريخ': date(row.work_date),
        'المشروع': row.project || '—',
        'القطاع': row.section || '—',
        'المهندسين': row.engineers || '—',
        'الفنيين': row.technicians || '—',
        'المساعدين': row.assistants || '—',
        'العمال': row.workers || '—',
        'الأمتار': Number(row.meters || 0),
        'سعر المتر': Number(row.price_per_meter || 0),
        'الإجمالي': Number(row.total || 0),
        'المراجعة': row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم',
        'الملاحظات': row.note || '',
      }))),
    },
  ] : []

  const exportExcel = async () => {
    if (!report || exporting) return
    setExporting(true)
    try {
      await exportExecutiveExcel({
        filename: `stc-quarter-${selectedKeys.join('-')}`,
        title: 'STC QUARTER PRODUCTIVITY REPORT',
        subtitle: titleRange,
        kpis: [
          { label: 'العمليات', value: report.operations },
          { label: 'إجمالي الأمتار', value: report.meters },
          { label: 'قيمة الإنتاجية', value: report.revenue },
          { label: 'متوسط سعر المتر', value: report.avgPrice },
          { label: 'مستحقات الفريق', value: report.labor },
          { label: 'نسبة الحضور %', value: report.attendanceRate },
        ],
        highlights: [
          { title: 'أعلى دورة تنفيذًا', value: report.topCycle ? `${report.topCycle.label} · ${number(report.topCycle.meters)} م` : '—' },
          { title: 'أعلى مشروع', value: report.topProject ? `${report.topProject.name} · ${number(report.topProject.meters)} م` : '—' },
          { title: 'أعلى قطاع', value: report.topSection ? `${report.topSection.name} · ${number(report.topSection.meters)} م` : '—' },
          { title: 'أعلى مستحق فردي', value: report.topPerson ? `${report.topPerson.person_name} · ${money(report.topPerson.earnings)}` : '—' },
        ],
        sheets: excelSheets,
      })
    } catch (error) {
      feedback.error('تعذر إنشاء تقرير الكوارتر', error.message || 'حدث خطأ أثناء إنشاء ملف Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page-stack executive-report-page quarter-report-page">
      <section className="quarter-selector no-print">
        <div className="quarter-selector__copy">
          <span className="eyebrow">QUARTER CALCULATOR</span>
          <h2>حساب الكوارتر</h2>
          <p>اختار 3 دورات مختلفة، والنظام يجمع التشغيل والأفراد والحضور والمستحقات في تقرير واحد.</p>
        </div>
        <div className="quarter-select-grid">
          {selectedKeys.map((selected, index) => (
            <label key={index}>
              <span>الدورة {index + 1}</span>
              <select value={selected} onChange={(event) => setSlot(index, event.target.value)}>
                <option value="">اختر دورة</option>
                {cycles.map((cycle) => {
                  const usedElsewhere = selectedKeys.some((value, valueIndex) => valueIndex !== index && value === cycle.month_key)
                  return (
                    <option key={cycle.month_key} value={cycle.month_key} disabled={usedElsewhere}>
                      {monthName(cycle.month_key)} · {cycle.submission_count} عملية
                    </option>
                  )
                })}
              </select>
            </label>
          ))}
        </div>
      </section>

      {!validSelection ? (
        <div className="page-error">اختار 3 دورات مختلفة لحساب الكوارتر.</div>
      ) : query.isLoading ? (
        <div className="page-loader">جاري تجميع بيانات الكوارتر من الدورات الثلاث...</div>
      ) : query.isError ? (
        <div className="page-error">{query.error.message}</div>
      ) : report ? (
        <>
          <section className="report-actions no-print">
            <div>
              <strong>تقرير الكوارتر — {titleRange}</strong>
              <span>Dashboard موحدة للدورات الثلاث مع تقرير Excel وPDF كامل.</span>
            </div>
            <div>
              <button className="btn btn-secondary" type="button" onClick={exportExcel} disabled={exporting}>
                <FileSpreadsheet size={16} /> {exporting ? '...' : 'تقرير Excel'}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => window.print()}>
                <Printer size={16} /> PDF / طباعة
              </button>
            </div>
          </section>

          <article className="executive-report-document quarter-report-document">
            <header className="executive-report-cover quarter-report-cover">
              <div>
                <span>STC · QUARTER ENGINEERING OPERATIONS REPORT</span>
                <h1>تقرير الكوارتر التنفيذي</h1>
                <p>{titleRange}</p>
              </div>
              <div className="report-cover-mark"><CalendarRange size={31} /></div>
            </header>

            <section className="report-kpi-grid">
              <Kpi icon={BarChart3} label="العمليات" value={number(report.operations)} />
              <Kpi icon={Ruler} label="إجمالي الأمتار" value={`${number(report.meters)} م`} />
              <Kpi icon={TrendingUp} label="قيمة الإنتاجية" value={money(report.revenue)} />
              <Kpi icon={CircleDollarSign} label="مستحقات الفريق" value={money(report.labor)} />
              <Kpi icon={CalendarCheck2} label="نسبة الحضور" value={`${number(report.attendanceRate, 1)}%`} helper={`${number(report.present)} حضور · ${number(report.absent)} غياب`} />
              <Kpi icon={Users} label="أفراد التنفيذ" value={number(report.uniquePeople)} />
            </section>

            <section className="quarter-highlight-grid">
              <article><span>أعلى دورة تنفيذًا</span><strong>{report.topCycle?.label || '—'}</strong><small>{report.topCycle ? `${number(report.topCycle.meters)} م · ${money(report.topCycle.revenue)}` : '—'}</small></article>
              <article><span>أعلى مشروع</span><strong>{report.topProject?.name || '—'}</strong><small>{report.topProject ? `${number(report.topProject.meters)} م · ${number(report.topProject.operations)} عملية` : '—'}</small></article>
              <article><span>أعلى قطاع</span><strong>{report.topSection?.name || '—'}</strong><small>{report.topSection ? `${number(report.topSection.meters)} م · ${number(report.topSection.operations)} عملية` : '—'}</small></article>
              <article><span>أعلى مستحق فردي</span><strong>{report.topPerson?.person_name || '—'}</strong><small>{report.topPerson ? `${roleLabels[report.topPerson.role] || report.topPerson.role} · ${money(report.topPerson.earnings)}` : '—'}</small></article>
            </section>

            <section className="report-section">
              <header><div><span>CYCLE COMPARISON</span><h2>مقارنة الدورات الثلاث</h2></div><small>Quarter Overview</small></header>
              <div className="data-table-wrap">
                <table className="data-table report-table">
                  <thead><tr><th>الدورة</th><th>العمليات</th><th>الأمتار</th><th>قيمة الإنتاجية</th><th>متوسط / متر</th><th>المستحقات</th><th>الحضور</th><th>الأفراد</th></tr></thead>
                  <tbody>
                    {report.cycleRows.map((row) => (
                      <tr key={row.monthKey}>
                        <td className="strong-cell">{row.label}</td>
                        <td>{number(row.operations)}</td>
                        <td>{number(row.meters)} م</td>
                        <td>{money(row.revenue)}</td>
                        <td>{money(row.avgPrice)}</td>
                        <td>{money(row.labor)}</td>
                        <td>{number(row.attendanceRate, 1)}%</td>
                        <td>{number(row.peopleCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-two-column quarter-chart-grid">
              <section className="report-section quarter-chart-card">
                <header><div><span>METERS TREND</span><h2>الأمتار حسب الدورة</h2></div></header>
                <div className="quarter-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.cycleRows}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(37,58,85,.12)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => `${number(value)} م`} contentStyle={chartTooltipStyle} />
                      <Bar dataKey="meters" name="الأمتار" fill="var(--blue-600)" radius={[7, 7, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="report-section quarter-chart-card">
                <header><div><span>FINANCIAL TREND</span><h2>الإنتاجية والمستحقات</h2></div></header>
                <div className="quarter-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.cycleRows}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(37,58,85,.12)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => money(value)} contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="revenue" name="قيمة الإنتاجية" fill="var(--brand-navy)" radius={[7, 7, 0, 0]} />
                      <Bar dataKey="labor" name="المستحقات" fill="var(--brand-gold)" radius={[7, 7, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </section>

            <section className="report-two-column">
              <section className="report-section">
                <header><div><span>TOP PROJECTS</span><h2>أعلى المشاريع</h2></div><BriefcaseBusiness size={17} /></header>
                <div className="report-ranking-list">
                  {report.projects.slice(0, 10).map((row, index) => (
                    <div key={row.name}><b>{index + 1}</b><span><strong>{row.name}</strong><small>{number(row.operations)} عملية</small></span><em>{number(row.meters)} م</em></div>
                  ))}
                </div>
              </section>
              <section className="report-section">
                <header><div><span>TOP SECTIONS</span><h2>أعلى القطاعات</h2></div><Layers3 size={17} /></header>
                <div className="report-ranking-list">
                  {report.sections.slice(0, 10).map((row, index) => (
                    <div key={row.name}><b>{index + 1}</b><span><strong>{row.name}</strong><small>{number(row.operations)} عملية</small></span><em>{number(row.meters)} م</em></div>
                  ))}
                </div>
              </section>
            </section>

            <section className="report-section">
              <header><div><span>TEAM PERFORMANCE</span><h2>أداء كل الأفراد خلال الكوارتر</h2></div><small>{number(report.people.length)} فرد</small></header>
              <div className="data-table-wrap">
                <table className="data-table report-table">
                  <thead><tr><th>#</th><th>الاسم</th><th>الدور</th><th>العمليات</th><th>الأمتار</th><th>المستحقات</th></tr></thead>
                  <tbody>
                    {report.people.map((row, index) => (
                      <tr key={row.person_id || `${row.person_name}-${row.role}`}>
                        <td>{index + 1}</td><td className="strong-cell">{row.person_name}</td><td>{roleLabels[row.role] || row.role}</td>
                        <td>{number(row.operationsCount)}</td><td>{number(row.meters)}</td><td>{money(row.earnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-section">
              <header><div><span>PROJECT DETAIL</span><h2>تفاصيل كل المشاريع</h2></div><small>{number(report.projects.length)} مشروع</small></header>
              <div className="data-table-wrap">
                <table className="data-table report-table">
                  <thead><tr><th>المشروع</th><th>العمليات</th><th>الأمتار</th><th>قيمة الإنتاجية</th><th>متوسط / متر</th>{selectedCycles.map((cycle) => <th key={cycle.month_key}>{monthName(cycle.month_key)}</th>)}</tr></thead>
                  <tbody>
                    {report.projects.map((row) => (
                      <tr key={row.name}>
                        <td className="strong-cell">{row.name}</td><td>{number(row.operations)}</td><td>{number(row.meters)}</td>
                        <td>{money(row.revenue)}</td><td>{money(row.meters > 0 ? row.revenue / row.meters : 0)}</td>
                        {selectedCycles.map((cycle) => <td key={cycle.month_key}>{number(row.byCycle[cycle.month_key]?.meters || 0)} م</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-section">
              <header><div><span>SECTION DETAIL</span><h2>تفاصيل كل القطاعات</h2></div><small>{number(report.sections.length)} قطاع</small></header>
              <div className="data-table-wrap">
                <table className="data-table report-table">
                  <thead><tr><th>القطاع</th><th>العمليات</th><th>الأمتار</th><th>قيمة الإنتاجية</th><th>متوسط / متر</th>{selectedCycles.map((cycle) => <th key={cycle.month_key}>{monthName(cycle.month_key)}</th>)}</tr></thead>
                  <tbody>
                    {report.sections.map((row) => (
                      <tr key={row.name}>
                        <td className="strong-cell">{row.name}</td><td>{number(row.operations)}</td><td>{number(row.meters)}</td>
                        <td>{money(row.revenue)}</td><td>{money(row.meters > 0 ? row.revenue / row.meters : 0)}</td>
                        {selectedCycles.map((cycle) => <td key={cycle.month_key}>{number(row.byCycle[cycle.month_key]?.meters || 0)} م</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-section report-full-operations">
              <header><div><span>FULL OPERATIONS</span><h2>كل عمليات الكوارتر</h2></div><small>{number(report.operations)} عملية</small></header>
              <div className="data-table-wrap">
                <table className="data-table report-table report-operations-table">
                  <thead>
                    <tr><th>الدورة</th><th>التاريخ</th><th>المشروع</th><th>القطاع</th><th>المهندسين</th><th>الفنيين</th><th>المساعدين</th><th>العمال</th><th>الأمتار</th><th>سعر المتر</th><th>الإجمالي</th><th>المراجعة</th></tr>
                  </thead>
                  <tbody>
                    {report.cyclesData.flatMap((cycle) => cycle.rows.map((row, index) => (
                      <tr key={row.id || `${cycle.monthKey}-${index}`}>
                        <td>{monthName(cycle.monthKey)}</td><td>{date(row.work_date)}</td><td>{row.project || '—'}</td><td>{row.section || '—'}</td>
                        <td>{row.engineers || '—'}</td><td>{row.technicians || '—'}</td><td>{row.assistants || '—'}</td><td>{row.workers || '—'}</td>
                        <td>{number(row.meters)}</td><td>{money(row.price_per_meter)}</td><td>{money(row.total)}</td><td>{row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="executive-report-footer">
              <span>Generated from STC Productivity System · Quarter Report</span>
              <strong>{titleRange}</strong>
            </footer>
          </article>
        </>
      ) : null}
    </div>
  )
}
