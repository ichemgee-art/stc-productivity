import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, CalendarDays, CircleDollarSign, FileSpreadsheet, FolderKanban,
  Printer, Ruler, Search, TrendingUp, Users, X,
} from 'lucide-react'
import { useCycle } from '../context/CycleContext'
import { useFeedback } from '../context/FeedbackContext'
import { appService } from '../services/appService'
import { exportExecutiveExcel } from '../lib/exporters'
import { date, money, monthName, number, roleLabels } from '../lib/format'
import { normalizeSearch, smartIncludes } from '../lib/smartSearch'

const PROJECT_HISTORY_SEARCH_KEY = 'stc_project_history_search'
const PROJECT_HISTORY_SELECTED_KEY = 'stc_project_history_selected'
const PROJECT_HISTORY_DATE_FROM_KEY = 'stc_project_history_date_from'
const PROJECT_HISTORY_DATE_TO_KEY = 'stc_project_history_date_to'

const getInitialProjectSearch = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PROJECT_HISTORY_SELECTED_KEY)
    || window.localStorage.getItem(PROJECT_HISTORY_SEARCH_KEY)
    || ''
}

const getInitialSelectedProject = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PROJECT_HISTORY_SELECTED_KEY) || ''
}

const getInitialDateFrom = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PROJECT_HISTORY_DATE_FROM_KEY) || ''
}

const getInitialDateTo = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PROJECT_HISTORY_DATE_TO_KEY) || ''
}

const summarizeRows = (rows) => {
  const meters = rows.reduce((sum, row) => sum + Number(row.meters || 0), 0)
  const value = rows.reduce((sum, row) => sum + Number(row.total || 0), 0)
  return {
    operations: rows.length,
    meters,
    value,
    avgPrice: meters > 0 ? value / meters : 0,
  }
}

const aggregatePeople = (rows) => {
  const map = new Map()
  rows.forEach((row) => {
    const key = row.person_id || `${row.person_name}-${row.role}`
    const current = map.get(key) || {
      id: key,
      name: row.person_name || '—',
      role: row.role,
      meters: 0,
      earnings: 0,
      operations: new Set(),
      firstDate: row.work_date,
      lastDate: row.work_date,
    }
    current.meters += Number(row.meters || 0)
    current.earnings += Number(row.share_amount || 0)
    current.operations.add(row.submission_id)
    if (!current.firstDate || row.work_date < current.firstDate) current.firstDate = row.work_date
    if (!current.lastDate || row.work_date > current.lastDate) current.lastDate = row.work_date
    map.set(key, current)
  })

  return [...map.values()]
    .map((row) => ({ ...row, operationsCount: row.operations.size }))
    .sort((a, b) => b.earnings - a.earnings)
}

const groupBy = (rows, key) => {
  const map = new Map()
  rows.forEach((row) => {
    const name = row[key] || 'بدون'
    const current = map.get(name) || { name, operations: 0, meters: 0, value: 0 }
    current.operations += 1
    current.meters += Number(row.meters || 0)
    current.value += Number(row.total || 0)
    map.set(name, current)
  })
  return [...map.values()].sort((a, b) => b.meters - a.meters)
}

const cycleForDate = (cycles, workDate) => (
  cycles.find((cycle) => workDate >= cycle.cycle_start && workDate <= cycle.cycle_end) || null
)

export default function ExecutiveReportPage() {
  const { cycles } = useCycle()
  const feedback = useFeedback()
  const [search, setSearch] = useState(getInitialProjectSearch)
  const [selectedProject, setSelectedProject] = useState(getInitialSelectedProject)
  const [dateFrom, setDateFrom] = useState(getInitialDateFrom)
  const [dateTo, setDateTo] = useState(getInitialDateTo)
  const [exporting, setExporting] = useState(false)

  const historyQuery = useQuery({
    queryKey: ['all-time', 'project-history-report'],
    queryFn: async () => {
      const [rows, peopleOps] = await Promise.all([
        appService.historicalProductivityRows(),
        appService.historicalPersonOperations(),
      ])
      return { rows, peopleOps }
    },
    staleTime: 60_000,
  })

  const allRows = historyQuery.data?.rows || []
  const allPeopleOps = historyQuery.data?.peopleOps || []

  const saveSelectedProject = (projectName) => {
    setSelectedProject(projectName)
    if (typeof window !== 'undefined') {
      if (projectName) {
        window.localStorage.setItem(PROJECT_HISTORY_SELECTED_KEY, projectName)
        window.localStorage.setItem(PROJECT_HISTORY_SEARCH_KEY, projectName)
      } else {
        window.localStorage.removeItem(PROJECT_HISTORY_SELECTED_KEY)
      }
    }
  }

  const updateSearch = (value) => {
    setSearch(value)
    if (typeof window !== 'undefined') {
      if (value.trim()) window.localStorage.setItem(PROJECT_HISTORY_SEARCH_KEY, value)
      else window.localStorage.removeItem(PROJECT_HISTORY_SEARCH_KEY)
    }

    if (selectedProject && normalizeSearch(value) !== normalizeSearch(selectedProject)) {
      saveSelectedProject('')
    }
  }

  const chooseProject = (projectName) => {
    setSearch(projectName)
    saveSelectedProject(projectName)
  }

  const updateDateFrom = (value) => {
    setDateFrom(value)
    if (typeof window !== 'undefined') {
      if (value) window.localStorage.setItem(PROJECT_HISTORY_DATE_FROM_KEY, value)
      else window.localStorage.removeItem(PROJECT_HISTORY_DATE_FROM_KEY)
    }
  }

  const updateDateTo = (value) => {
    setDateTo(value)
    if (typeof window !== 'undefined') {
      if (value) window.localStorage.setItem(PROJECT_HISTORY_DATE_TO_KEY, value)
      else window.localStorage.removeItem(PROJECT_HISTORY_DATE_TO_KEY)
    }
  }

  const clearDateRange = () => {
    setDateFrom('')
    setDateTo('')
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PROJECT_HISTORY_DATE_FROM_KEY)
      window.localStorage.removeItem(PROJECT_HISTORY_DATE_TO_KEY)
    }
  }

  const clearSearch = () => {
    setSearch('')
    setSelectedProject('')
    clearDateRange()
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PROJECT_HISTORY_SEARCH_KEY)
      window.localStorage.removeItem(PROJECT_HISTORY_SELECTED_KEY)
    }
  }

  const normalizedSearch = search.trim()
  const hasDateRange = Boolean(dateFrom || dateTo)

  const projectNames = useMemo(
    () => [...new Set(allRows.map((row) => row.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')),
    [allRows],
  )

  const matchedProjectNames = useMemo(() => {
    if (!normalizedSearch) return []
    return projectNames.filter((name) => smartIncludes(normalizedSearch, name))
  }, [normalizedSearch, projectNames])

  useEffect(() => {
    if (!normalizedSearch || !projectNames.length) return

    const exactMatch = projectNames.find(
      (name) => normalizeSearch(name) === normalizeSearch(normalizedSearch),
    )

    if (exactMatch) {
      if (selectedProject !== exactMatch) saveSelectedProject(exactMatch)
      return
    }

    if (matchedProjectNames.length === 1) {
      const onlyMatch = matchedProjectNames[0]
      if (selectedProject !== onlyMatch) saveSelectedProject(onlyMatch)
    }
  }, [normalizedSearch, projectNames, matchedProjectNames, selectedProject])

  const effectiveProject = useMemo(() => {
    if (!selectedProject) return ''
    const normalizedSelected = normalizeSearch(selectedProject)
    return projectNames.find((name) => normalizeSearch(name) === normalizedSelected) || ''
  }, [selectedProject, projectNames])

  const report = useMemo(() => {
    if (!effectiveProject) return null

    const normalizedProject = normalizeSearch(effectiveProject)
    const rows = allRows
      .filter((row) => {
        if (normalizeSearch(row.project) !== normalizedProject) return false
        const workDate = String(row.work_date || '').slice(0, 10)
        if (dateFrom && workDate < dateFrom) return false
        if (dateTo && workDate > dateTo) return false
        return true
      })
      .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)))

    const rowIds = new Set(rows.map((row) => String(row.id)))
    const peopleOps = allPeopleOps.filter((row) => rowIds.has(String(row.submission_id)))

    const summary = summarizeRows(rows)
    const labor = peopleOps.reduce((sum, row) => sum + Number(row.share_amount || 0), 0)
    const people = aggregatePeople(peopleOps)
    const sections = groupBy(rows, 'section')

    const firstDate = rows[0]?.work_date || null
    const lastDate = rows.at(-1)?.work_date || null

    const cycleMap = new Map()
    rows.forEach((row) => {
      const cycle = cycleForDate(cycles, row.work_date)
      const key = cycle?.month_key || 'outside-cycle'
      const current = cycleMap.get(key) || {
        key,
        label: cycle ? monthName(cycle.month_key) : 'خارج دورة معروفة',
        cycleStart: cycle?.cycle_start || null,
        cycleEnd: cycle?.cycle_end || null,
        operations: 0,
        meters: 0,
        value: 0,
        labor: 0,
        people: new Set(),
        firstDate: row.work_date,
        lastDate: row.work_date,
      }
      current.operations += 1
      current.meters += Number(row.meters || 0)
      current.value += Number(row.total || 0)
      if (row.work_date < current.firstDate) current.firstDate = row.work_date
      if (row.work_date > current.lastDate) current.lastDate = row.work_date
      cycleMap.set(key, current)
    })

    peopleOps.forEach((row) => {
      const cycle = cycleForDate(cycles, row.work_date)
      const key = cycle?.month_key || 'outside-cycle'
      const current = cycleMap.get(key)
      if (!current) return
      current.labor += Number(row.share_amount || 0)
      if (row.person_id) current.people.add(row.person_id)
    })

    const cycleRows = [...cycleMap.values()]
      .map((row) => ({ ...row, peopleCount: row.people.size }))
      .sort((a, b) => String(a.firstDate).localeCompare(String(b.firstDate)))

    return {
      rows,
      peopleOps,
      summary,
      labor,
      people,
      sections,
      firstDate,
      lastDate,
      cycleRows,
      projectNames: [effectiveProject],
    }
  }, [effectiveProject, allRows, allPeopleOps, cycles, dateFrom, dateTo])

  const hasResults = Boolean(report?.rows.length)

  const sheets = report ? [
    {
      name: 'ملخص المشروع',
      rows: [{
        'المشروع / المشاريع المطابقة': report.projectNames.join('، '),
        'أول عملية': report.firstDate ? date(report.firstDate) : '—',
        'آخر عملية': report.lastDate ? date(report.lastDate) : '—',
        'عدد الدورات': report.cycleRows.length,
        'عدد العمليات': report.summary.operations,
        'إجمالي الأمتار': report.summary.meters,
        'قيمة الإنتاجية': report.summary.value,
        'متوسط سعر المتر': report.summary.avgPrice,
        'مستحقات فريق التنفيذ': report.labor,
        'عدد أفراد التنفيذ': report.people.length,
      }],
    },
    {
      name: 'الحصر حسب الدورات',
      rows: report.cycleRows.map((row) => ({
        'الدورة': row.label,
        'من': row.cycleStart ? date(row.cycleStart) : date(row.firstDate),
        'إلى': row.cycleEnd ? date(row.cycleEnd) : date(row.lastDate),
        'العمليات': row.operations,
        'الأمتار': row.meters,
        'قيمة الإنتاجية': row.value,
        'متوسط سعر المتر': row.meters > 0 ? row.value / row.meters : 0,
        'مستحقات الفريق': row.labor,
        'أفراد التنفيذ': row.peopleCount,
      })),
    },
    {
      name: 'القطاعات',
      rows: report.sections.map((row) => ({
        'القطاع': row.name,
        'العمليات': row.operations,
        'الأمتار': row.meters,
        'قيمة الإنتاجية': row.value,
        'متوسط سعر المتر': row.meters > 0 ? row.value / row.meters : 0,
      })),
    },
    {
      name: 'أداء الأفراد',
      rows: report.people.map((row) => ({
        'الاسم': row.name,
        'الدور': roleLabels[row.role] || row.role || '—',
        'العمليات': row.operationsCount,
        'الأمتار': row.meters,
        'المستحقات': row.earnings,
        'أول ظهور': row.firstDate ? date(row.firstDate) : '—',
        'آخر ظهور': row.lastDate ? date(row.lastDate) : '—',
      })),
    },
    {
      name: 'كل العمليات',
      rows: report.rows.map((row, index) => ({
        '#': index + 1,
        'التاريخ': date(row.work_date),
        'المشروع': row.project || '—',
        'القطاع': row.section || '—',
        'المهندسين': row.engineers || '—',
        'الفنيين': row.technicians || '—',
        'عدد الفنيين': Number(row.technician_count || 0),
        'المساعدين': row.assistants || '—',
        'عدد المساعدين': Number(row.assistant_count || 0),
        'العمال': row.workers || '—',
        'عدد العمال': Number(row.worker_count || 0),
        'الأمتار': Number(row.meters || 0),
        'سعر المتر': Number(row.price_per_meter || 0),
        'الإجمالي': Number(row.total || 0),
        'إجمالي مستحق الفنيين': Number(row.tech_share_total || 0),
        'مستحق الفني للفرد': Number(row.tech_share_per_person || 0),
        'إجمالي مستحق المساعدين': Number(row.assistant_share_total || 0),
        'مستحق المساعد للفرد': Number(row.assistant_share_per_person || 0),
        'إجمالي مستحق العمال': Number(row.worker_share_total || 0),
        'مستحق العامل للفرد': Number(row.worker_share_per_person || 0),
        'المراجعة': row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم',
        'السعر مفقود': row.price_missing ? 'نعم' : 'لا',
        'الملاحظات': row.note || '',
        'وقت الإدخال': row.submitted_at || '',
        'آخر تحديث': row.updated_at || '',
      })),
    },
  ] : []

  const exportExcel = async () => {
    if (!hasResults || exporting) return
    setExporting(true)
    try {
      await exportExecutiveExcel({
        filename: `stc-project-history-${effectiveProject}${dateFrom ? `-${dateFrom}` : ''}${dateTo ? `-${dateTo}` : ''}`,
        title: 'STC PROJECT FULL HISTORY REPORT',
        subtitle: `${report.projectNames.join('، ')} · ${hasDateRange ? `الفترة المختارة: ${dateFrom ? date(dateFrom) : 'البداية'} → ${dateTo ? date(dateTo) : 'النهاية'}` : `كل الفترات: من ${date(report.firstDate)} إلى ${date(report.lastDate)}`}`,
        kpis: [
          { label: 'العمليات', value: report.summary.operations },
          { label: 'إجمالي الأمتار', value: report.summary.meters },
          { label: 'قيمة الإنتاجية', value: report.summary.value },
          { label: 'متوسط سعر المتر', value: report.summary.avgPrice },
          { label: 'مستحقات الفريق', value: report.labor },
          { label: 'عدد الدورات', value: report.cycleRows.length },
        ],
        highlights: [
          { title: 'أول عملية', value: date(report.firstDate) },
          { title: 'آخر عملية', value: date(report.lastDate) },
          { title: 'أفراد التنفيذ', value: number(report.people.length) },
          { title: 'أعلى قطاع', value: report.sections[0] ? `${report.sections[0].name} · ${number(report.sections[0].meters)} م` : '—' },
        ],
        sheets,
      })
    } catch (error) {
      feedback.error('تعذر إنشاء تقرير المشروع', error.message || 'حدث خطأ أثناء إنشاء ملف Excel')
    } finally {
      setExporting(false)
    }
  }

  if (historyQuery.isLoading) {
    return <div className="page-loader">جاري تجهيز أرشيف المشاريع الكامل...</div>
  }

  if (historyQuery.isError) {
    return <div className="page-error">{historyQuery.error.message}</div>
  }

  return (
    <div className="page-stack executive-report-page project-history-report-page">
      <section className="project-history-search no-print">
        <div className="project-history-search__copy">
          <span className="eyebrow">PROJECT FULL HISTORY</span>
          <h2>حصر كامل بالمشروع</h2>
          <p>اكتب اسم المشروع، والنظام يجمع كل عملياته من أول يوم مسجل لآخر يوم عبر كل الدورات والشهور.</p>
        </div>

        <label className="project-history-search__field">
          <span>اسم المشروع</span>
          <div className="input-with-icon">
            <Search size={18} />
            <input
              list="project-history-options"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="اكتب اسم المشروع..."
              autoComplete="off"
            />
            {normalizedSearch ? (
              <button
                className="project-history-clear"
                type="button"
                onClick={clearSearch}
                title="مسح الحصر"
                aria-label="مسح اسم المشروع والحصر"
              >
                <X size={16} />
              </button>
            ) : null}
            <datalist id="project-history-options">
              {projectNames.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
        </label>

        <div className="project-history-period">
          <div className="project-history-period__head">
            <div>
              <strong>الفترة</strong>
              <small>{hasDateRange ? 'الحصر مفلتر بالفترة المختارة' : 'كل الفترات — الوضع الافتراضي'}</small>
            </div>
            {hasDateRange ? (
              <button className="btn btn-ghost btn-sm" type="button" onClick={clearDateRange}>
                <X size={14} /> كل الفترات
              </button>
            ) : <span className="status-pill success">كل الفترات</span>}
          </div>
          <div className="project-history-period__grid">
            <label>
              <span>من تاريخ</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => updateDateFrom(event.target.value)}
              />
            </label>
            <label>
              <span>إلى تاريخ</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => updateDateTo(event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      {normalizedSearch && matchedProjectNames.length > 1 && !effectiveProject ? (
        <section className="project-match-strip no-print">
          <span>مشروعات مطابقة:</span>
          <div>
            {matchedProjectNames.slice(0, 12).map((name) => (
              <button key={name} type="button" onClick={() => chooseProject(name)}>{name}</button>
            ))}
          </div>
        </section>
      ) : null}

      {!normalizedSearch ? (
        <section className="project-history-empty">
          <Search size={34} />
          <strong>ابدأ بكتابة اسم المشروع</strong>
          <p>الحصر غير مرتبط بالدورة المختارة بالأعلى؛ البحث يتم على كل البيانات التاريخية المسجلة في النظام.</p>
        </section>
      ) : !effectiveProject ? (
        <section className="project-history-empty">
          <FolderKanban size={34} />
          <strong>{matchedProjectNames.length ? 'اختار المشروع المطلوب' : 'مفيش مشروع مطابق للبحث'}</strong>
          <p>{matchedProjectNames.length ? 'في أكتر من مشروع قريب من البحث. اختار اسم مشروع واحد من الاقتراحات عشان الحصر يكون Exact عليه فقط.' : 'جرّب كتابة جزء أوضح من اسم المشروع.'}</p>
        </section>
      ) : !hasResults ? (
        <section className="project-history-empty">
          <FolderKanban size={34} />
          <strong>{hasDateRange ? 'مفيش عمليات في الفترة المختارة' : 'المشروع المختار ملوش عمليات مسجلة'}</strong>
          <p>{hasDateRange ? 'المشروع موجود، لكن مفيش عمليات داخلة جوه رينج التاريخ الحالي. اختار فترة أوسع أو ارجع لكل الفترات.' : 'تم اختيار المشروع بالاسم المطابق، لكن مفيش عمليات تاريخية مرتبطة به.'}</p>
        </section>
      ) : (
        <>
          <section className="report-actions no-print">
            <div>
              <strong>حصر المشروع — {report.projectNames.join('، ')}</strong>
              <span>{hasDateRange ? `الفترة المختارة: ${dateFrom ? date(dateFrom) : 'من البداية'} إلى ${dateTo ? date(dateTo) : 'آخر تاريخ'}` : `كل الفترات: من ${date(report.firstDate)} إلى ${date(report.lastDate)}`} · {number(report.cycleRows.length)} دورة</span>
            </div>
            <div>
              <button className="btn btn-secondary" type="button" onClick={exportExcel} disabled={exporting}>
                <FileSpreadsheet size={16} /> {exporting ? '...' : 'تقرير Excel'}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => window.print()}>
                <Printer size={16} /> PDF / طباعة
              </button>
              <button className="btn btn-ghost" type="button" onClick={clearSearch}>
                <X size={16} /> مسح الحصر
              </button>
            </div>
          </section>

          <article className="executive-report-document project-history-document">
            <header className="executive-report-cover project-history-cover">
              <div>
                <span>STC · COMPLETE PROJECT HISTORY REPORT</span>
                <h1>{report.projectNames.join('، ')}</h1>
                <p>{hasDateRange ? <>الحصر خلال الفترة المختارة · {dateFrom ? date(dateFrom) : 'من البداية'} → {dateTo ? date(dateTo) : 'آخر تاريخ'}</> : <>حصر تاريخي كامل من {date(report.firstDate)} إلى {date(report.lastDate)}</>}</p>
              </div>
              <div className="report-cover-logo"><img src="/stc-logo-hq.jpg" alt="STC Specialized Trading & Construction" /></div>
            </header>

            <section className="report-kpi-grid project-history-kpis">
              <div><BarChart3 /><span>إجمالي العمليات</span><strong>{number(report.summary.operations)}</strong></div>
              <div><Ruler /><span>إجمالي الأمتار</span><strong>{number(report.summary.meters)} م</strong></div>
              <div><TrendingUp /><span>قيمة الإنتاجية</span><strong>{money(report.summary.value)}</strong></div>
              <div><CircleDollarSign /><span>مستحقات الفريق</span><strong>{money(report.labor)}</strong></div>
              <div><CalendarDays /><span>عدد الدورات</span><strong>{number(report.cycleRows.length)}</strong></div>
              <div><Users /><span>أفراد التنفيذ</span><strong>{number(report.people.length)}</strong></div>
            </section>

            <section className="project-history-date-range">
              <article><span>أول عملية</span><strong>{date(report.firstDate)}</strong></article>
              <article><span>آخر عملية</span><strong>{date(report.lastDate)}</strong></article>
              <article><span>متوسط سعر المتر</span><strong>{money(report.summary.avgPrice)}</strong></article>
              <article><span>عدد القطاعات</span><strong>{number(report.sections.length)}</strong></article>
            </section>

            <section className="report-section">
              <header><div><span>CYCLE HISTORY</span><h2>الحصر حسب كل دورة</h2></div><small>{number(report.cycleRows.length)} دورة</small></header>
              <div className="data-table-wrap">
                <table className="data-table report-table">
                  <thead>
                    <tr><th>الدورة</th><th>من</th><th>إلى</th><th>العمليات</th><th>الأمتار</th><th>قيمة الإنتاجية</th><th>متوسط / متر</th><th>المستحقات</th><th>الأفراد</th></tr>
                  </thead>
                  <tbody>
                    {report.cycleRows.map((row) => (
                      <tr key={row.key}>
                        <td className="strong-cell">{row.label}</td>
                        <td>{row.cycleStart ? date(row.cycleStart) : date(row.firstDate)}</td>
                        <td>{row.cycleEnd ? date(row.cycleEnd) : date(row.lastDate)}</td>
                        <td>{number(row.operations)}</td>
                        <td>{number(row.meters)}</td>
                        <td>{money(row.value)}</td>
                        <td>{money(row.meters > 0 ? row.value / row.meters : 0)}</td>
                        <td>{money(row.labor)}</td>
                        <td>{number(row.peopleCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-two-column">
              <section className="report-section">
                <header><div><span>SECTIONS</span><h2>القطاعات داخل المشروع</h2></div></header>
                <div className="report-ranking-list">
                  {report.sections.map((row, index) => (
                    <div key={row.name}>
                      <b>{index + 1}</b>
                      <span><strong>{row.name}</strong><small>{number(row.operations)} عملية</small></span>
                      <em>{number(row.meters)} م</em>
                    </div>
                  ))}
                </div>
              </section>

              <section className="report-section">
                <header><div><span>TEAM</span><h2>إجمالي فريق التنفيذ</h2></div><small>{number(report.people.length)} فرد</small></header>
                <div className="report-ranking-list">
                  {report.people.slice(0, 12).map((row, index) => (
                    <div key={row.id}>
                      <b>{index + 1}</b>
                      <span><strong>{row.name}</strong><small>{roleLabels[row.role] || row.role} · {number(row.operationsCount)} عملية</small></span>
                      <em>{money(row.earnings)}</em>
                    </div>
                  ))}
                </div>
              </section>
            </section>

            <section className="report-section">
              <header><div><span>TEAM DETAILS</span><h2>تفاصيل مستحقات وأداء كل فرد</h2></div><small>{number(report.people.length)} فرد</small></header>
              <div className="data-table-wrap">
                <table className="data-table report-table">
                  <thead><tr><th>#</th><th>الاسم</th><th>الدور</th><th>العمليات</th><th>الأمتار</th><th>المستحقات</th><th>أول ظهور</th><th>آخر ظهور</th></tr></thead>
                  <tbody>
                    {report.people.map((row, index) => (
                      <tr key={row.id}>
                        <td>{index + 1}</td><td className="strong-cell">{row.name}</td><td>{roleLabels[row.role] || row.role}</td>
                        <td>{number(row.operationsCount)}</td><td>{number(row.meters)}</td><td>{money(row.earnings)}</td>
                        <td>{date(row.firstDate)}</td><td>{date(row.lastDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-section report-full-operations">
              <header>
                <div><span>FULL PROJECT OPERATIONS</span><h2>{hasDateRange ? 'كل عمليات المشروع داخل الفترة المختارة' : 'كل عمليات المشروع من أول يوم لآخر يوم'}</h2></div>
                <small>{number(report.rows.length)} عملية</small>
              </header>
              <div className="print-operation-list">
                {report.rows.map((row, index) => (
                  <article className="print-operation-card" key={`print-${row.id || index}`}>
                    <header>
                      <div><span>عملية #{index + 1}</span><strong>{row.project || '—'}</strong></div>
                      <div><b>{date(row.work_date)}</b><small>{row.section || 'بدون قطاع'}</small></div>
                    </header>
                    <div className="print-operation-kpis">
                      <div><span>الأمتار</span><strong>{number(row.meters)} م</strong></div>
                      <div><span>سعر المتر</span><strong>{money(row.price_per_meter)}</strong></div>
                      <div><span>الإجمالي</span><strong>{money(row.total)}</strong></div>
                      <div><span>المراجعة</span><strong>{row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم'}</strong></div>
                    </div>
                    <div className="print-operation-team">
                      <div><span>المهندسين</span><strong>{row.engineers || '—'}</strong></div>
                      <div><span>الفنيين</span><strong>{row.technicians || '—'} · {number(row.technician_count || 0)}</strong></div>
                      <div><span>المساعدين</span><strong>{row.assistants || '—'} · {number(row.assistant_count || 0)}</strong></div>
                      <div><span>العمال</span><strong>{row.workers || '—'} · {number(row.worker_count || 0)}</strong></div>
                    </div>
                    <div className="print-operation-dues">
                      <div><span>مستحق الفنيين</span><strong>{money(row.tech_share_total)}</strong></div>
                      <div><span>مستحق المساعدين</span><strong>{money(row.assistant_share_total)}</strong></div>
                      <div><span>مستحق العمال</span><strong>{money(row.worker_share_total)}</strong></div>
                    </div>
                    {row.note ? <p className="print-operation-note"><b>ملاحظات:</b> {row.note}</p> : null}
                  </article>
                ))}
              </div>

              <div className="data-table-wrap">
                <table className="data-table report-table report-operations-table">
                  <thead>
                    <tr>
                      <th>#</th><th>التاريخ</th><th>المشروع</th><th>القطاع</th><th>المهندسين</th><th>الفنيين</th><th>ع.فنيين</th>
                      <th>المساعدين</th><th>ع.مساعدين</th><th>العمال</th><th>ع.عمال</th><th>الأمتار</th><th>سعر المتر</th><th>الإجمالي</th>
                      <th>مستحق الفنيين</th><th>مستحق المساعدين</th><th>مستحق العمال</th><th>المراجعة</th><th>الملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, index) => (
                      <tr key={row.id || index}>
                        <td>{index + 1}</td>
                        <td>{date(row.work_date)}</td>
                        <td className="strong-cell">{row.project || '—'}</td>
                        <td>{row.section || '—'}</td>
                        <td>{row.engineers || '—'}</td>
                        <td>{row.technicians || '—'}</td>
                        <td>{number(row.technician_count || 0)}</td>
                        <td>{row.assistants || '—'}</td>
                        <td>{number(row.assistant_count || 0)}</td>
                        <td>{row.workers || '—'}</td>
                        <td>{number(row.worker_count || 0)}</td>
                        <td>{number(row.meters)}</td>
                        <td>{money(row.price_per_meter)}</td>
                        <td>{money(row.total)}</td>
                        <td>{money(row.tech_share_total)}</td>
                        <td>{money(row.assistant_share_total)}</td>
                        <td>{money(row.worker_share_total)}</td>
                        <td>{row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم'}</td>
                        <td className="operation-note-column">{row.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="executive-report-footer">
              <span>STC Productivity System · {hasDateRange ? 'Project Date Range' : 'Project Full History'}</span>
              <strong>{date(report.firstDate)} → {date(report.lastDate)}</strong>
            </footer>
          </article>
        </>
      )}
    </div>
  )
}
