import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, BarChart3, BriefcaseBusiness,
  CalendarCheck2, CircleDollarSign, Gauge, Ruler, TrendingUp, Users,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useCycle } from '../context/CycleContext'
import { appService } from '../services/appService'
import EmptyState from '../components/EmptyState'
import { date, money, monthName, number, roleLabels } from '../lib/format'
import ExportButtons from '../components/ExportButtons'

const chartTooltipStyle = {
  borderRadius: 12,
  border: '1px solid rgba(37,58,85,.16)',
  boxShadow: '0 10px 30px rgba(37,58,85,.12)',
  fontFamily: 'Cairo',
  fontSize: 12,
}

const parseDay = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`)
const isoDay = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const addDays = (iso, n) => {
  const d = parseDay(iso)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
const daysBetween = (start, end) => Math.max(0, Math.floor((parseDay(end) - parseDay(start)) / 86400000) + 1)
const minIso = (...values) => values.filter(Boolean).sort()[0]

function summarizeRows(rows) {
  const tasks = rows.length
  const meters = rows.reduce((sum, row) => sum + Number(row.meters || 0), 0)
  const revenue = rows.reduce((sum, row) => sum + Number(row.total || 0), 0)
  return { tasks, meters, revenue, avgPrice: meters > 0 ? revenue / meters : 0 }
}

function summarizeAttendance(rows) {
  const effective = rows.filter((row) => row.status !== 'upcoming')
  const present = effective.filter((row) => row.status === 'present').length
  const absent = effective.filter((row) => row.status === 'absent').length
  const total = present + absent
  return { present, absent, rate: total > 0 ? (present / total) * 100 : 0 }
}

function pctChange(current, previous) {
  const c = Number(current || 0)
  const p = Number(previous || 0)
  if (p === 0) return c === 0 ? 0 : null
  return ((c - p) / Math.abs(p)) * 100
}

function Delta({ current, previous, suffix = '%' }) {
  const delta = pctChange(current, previous)
  if (delta == null) return <span className="management-delta neutral">جديد</span>
  const up = delta > 0
  const down = delta < 0
  return (
    <span className={`management-delta ${up ? 'up' : down ? 'down' : 'neutral'}`}>
      {up ? <ArrowUpRight size={13} /> : down ? <ArrowDownLeft size={13} /> : null}
      {number(Math.abs(delta), 1)}{suffix}
    </span>
  )
}

function ExecutiveKpi({ icon: Icon, label, value, helper, current, previous, tone = '' }) {
  return (
    <article className={`executive-kpi ${tone}`}>
      <div className="executive-kpi__head">
        <div><Icon size={18} /><span>{label}</span></div>
        <Delta current={current} previous={previous} />
      </div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function groupBy(rows, key) {
  const map = new Map()
  rows.forEach((row) => {
    const name = row[key] || 'بدون'
    const current = map.get(name) || { name, tasks: 0, meters: 0, revenue: 0 }
    current.tasks += 1
    current.meters += Number(row.meters || 0)
    current.revenue += Number(row.total || 0)
    map.set(name, current)
  })
  return [...map.values()]
}

function aggregatePeople(rows) {
  const map = new Map()
  rows.forEach((row) => {
    const current = map.get(row.person_id) || {
      person_id: row.person_id,
      person_name: row.person_name,
      role: row.role,
      submissions: new Set(),
      meters: 0,
      earnings: 0,
    }
    current.submissions.add(row.submission_id)
    current.meters += Number(row.meters || 0)
    current.earnings += Number(row.share_amount || 0)
    map.set(row.person_id, current)
  })
  return [...map.values()].map((row) => ({ ...row, tasks: row.submissions.size }))
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export default function DashboardPage() {
  const { monthKey, selectedCycle } = useCycle()

  const query = useQuery({
    queryKey: ['cycle-data', 'management-dashboard', monthKey],
    enabled: Boolean(monthKey && selectedCycle),
    queryFn: async () => {
      const currentDashboard = await appService.dashboard(monthKey)
      const previousKey = currentDashboard.previous_month_key
      const previousBounds = await appService.cycleBounds(previousKey)

      const [currentRows, previousRows, currentAttendance, previousAttendance, currentOps, previousOps, businessToday] = await Promise.all([
        appService.productivityRows(selectedCycle.cycle_start, selectedCycle.cycle_end),
        appService.productivityRows(previousBounds.cycle_start, previousBounds.cycle_end),
        appService.attendance(monthKey),
        appService.attendance(previousKey),
        appService.cyclePersonOperations(selectedCycle.cycle_start, selectedCycle.cycle_end),
        appService.cyclePersonOperations(previousBounds.cycle_start, previousBounds.cycle_end),
        appService.businessToday(),
      ])

      return {
        currentDashboard,
        previousKey,
        previousBounds,
        currentRows,
        previousRows,
        currentAttendance,
        previousAttendance,
        currentOps,
        previousOps,
        businessToday,
      }
    },
  })

  const view = useMemo(() => {
    if (!query.data) return null
    const {
      currentDashboard, previousKey, previousBounds,
      currentRows, previousRows, currentAttendance, previousAttendance,
      currentOps, previousOps, businessToday,
    } = query.data

    const today = businessToday
    const currentStart = selectedCycle.cycle_start
    const currentEnd = selectedCycle.cycle_end
    const currentCutoff = today < currentStart ? currentStart : minIso(today, currentEnd) || currentEnd
    const currentElapsedDays = Math.max(1, Math.min(daysBetween(currentStart, currentCutoff), daysBetween(currentStart, currentEnd)))
    const previousCycleDays = Math.max(1, daysBetween(previousBounds.cycle_start, previousBounds.cycle_end))
    const elapsedDays = Math.min(currentElapsedDays, previousCycleDays)
    const comparableCurrentCutoff = minIso(addDays(currentStart, elapsedDays - 1), currentCutoff) || currentCutoff
    const previousCutoff = minIso(addDays(previousBounds.cycle_start, elapsedDays - 1), previousBounds.cycle_end) || previousBounds.cycle_end

    const currentComparable = currentRows.filter((row) => row.work_date <= comparableCurrentCutoff)
    const previousComparable = previousRows.filter((row) => row.work_date <= previousCutoff)
    const currentOpsComparable = currentOps.filter((row) => row.work_date <= comparableCurrentCutoff)
    const previousOpsComparable = previousOps.filter((row) => row.work_date <= previousCutoff)
    const currentAttendanceComparable = currentAttendance.filter((row) => row.attendance_date <= comparableCurrentCutoff)
    const previousAttendanceComparable = previousAttendance.filter((row) => row.attendance_date <= previousCutoff)

    const currentSummary = summarizeRows(currentComparable)
    const previousSummary = summarizeRows(previousComparable)
    const currentAtt = summarizeAttendance(currentAttendanceComparable)
    const previousAtt = summarizeAttendance(previousAttendanceComparable)

    const currentLabor = currentOpsComparable.reduce((sum, row) => sum + Number(row.share_amount || 0), 0)
    const previousLabor = previousOpsComparable.reduce((sum, row) => sum + Number(row.share_amount || 0), 0)

    const projects = groupBy(currentComparable, 'project').sort((a, b) => b.meters - a.meters)
    const sections = groupBy(currentComparable, 'section').sort((a, b) => b.meters - a.meters)
    const people = aggregatePeople(currentOpsComparable).sort((a, b) => b.earnings - a.earnings || b.meters - a.meters)

    const currentDailyMap = new Map()
    currentComparable.forEach((row) => {
      currentDailyMap.set(row.work_date, (currentDailyMap.get(row.work_date) || 0) + Number(row.meters || 0))
    })
    const previousDailyMap = new Map()
    previousComparable.forEach((row) => {
      previousDailyMap.set(row.work_date, (previousDailyMap.get(row.work_date) || 0) + Number(row.meters || 0))
    })

    const dayComparison = Array.from({ length: elapsedDays }, (_, i) => {
      const currentDate = addDays(currentStart, i)
      const previousDate = addDays(previousBounds.cycle_start, i)
      return {
        day: i + 1,
        label: `يوم ${i + 1}`,
        current: currentDailyMap.get(currentDate) || 0,
        previous: previousDailyMap.get(previousDate) || 0,
      }
    })

    const workdays = Array.from({ length: elapsedDays }, (_, i) => addDays(currentStart, i))
      .filter((d) => parseDay(d).getDay() !== 5)
    const productionDates = new Set(currentComparable.map((row) => row.work_date))
    const noProductionDays = workdays.filter((d) => !productionDates.has(d))

    const zeroMeters = currentComparable.filter((row) => Number(row.meters || 0) === 0)
    const zeroPriceWithMeters = currentComparable.filter((row) => Number(row.meters || 0) > 0 && Number(row.price_per_meter || 0) === 0)
    const noTeam = currentComparable.filter((row) => !row.engineers && !row.technicians && !row.assistants && !row.workers)

    const positiveDaily = [...currentDailyMap.values()].filter((value) => value > 0)
    const med = median(positiveDaily)
    const anomalyThreshold = positiveDaily.length >= 4 ? med * 2.5 : Infinity
    const highDays = [...currentDailyMap.entries()]
      .filter(([, value]) => value > anomalyThreshold)
      .sort((a, b) => b[1] - a[1])

    const alerts = [
      zeroPriceWithMeters.length ? { tone: 'danger', title: 'أمتار بسعر صفر', value: zeroPriceWithMeters.length, text: 'عملية بها تنفيذ فعلي وسعر المتر يساوي صفر.' } : null,
      noTeam.length ? { tone: 'warning', title: 'عمليات بدون فريق', value: noTeam.length, text: 'عمليات مسجلة بدون أي فرد في فريق التنفيذ.' } : null,
      zeroMeters.length ? { tone: 'neutral', title: 'إنتاجية صفر', value: zeroMeters.length, text: 'عمليات مسجلة بأمتار = 0 للمراجعة التشغيلية.' } : null,
      noProductionDays.length ? { tone: 'warning', title: 'أيام عمل بلا عمليات', value: noProductionDays.length, text: noProductionDays.slice(0, 4).join(' · ') } : null,
      highDays.length ? { tone: 'info', title: 'أيام أعلى من المعتاد', value: highDays.length, text: `أعلى يوم: ${highDays[0][0]} · ${number(highDays[0][1])} م` } : null,
    ].filter(Boolean)

    return {
      previousKey,
      currentCutoff,
      previousCutoff,
      elapsedDays,
      currentSummary,
      previousSummary,
      currentAtt,
      previousAtt,
      currentLabor,
      previousLabor,
      projects,
      sections,
      people,
      dayComparison,
      alerts,
      topProject: projects[0] || null,
      lowProject: [...projects].sort((a, b) => a.meters - b.meters)[0] || null,
      topSection: sections[0] || null,
      productivityPerLabor: currentLabor > 0 ? currentSummary.revenue / currentLabor : 0,
      currentDashboard,
    }
  }, [query.data, selectedCycle])

  if (query.isLoading) return <div className="page-loader">جاري تجهيز لوحة الإدارة...</div>
  if (query.isError) return <div className="page-error">{query.error.message}</div>
  if (!view) return <EmptyState title="لا توجد بيانات للوحة الإدارة" />

  const projectChartData = view.projects.slice(0, 8)
  const topPeople = view.people.slice(0, 8)

  const dashboardExportSheets = [
    {
      name: 'ملخص الدورة',
      rows: [{
        'الدورة': monthName(monthKey),
        'حتى تاريخ': date(view.currentCutoff),
        'عدد الأيام المقارنة': view.elapsedDays,
        'العمليات': Number(view.currentSummary.tasks || 0),
        'إجمالي الأمتار': Number(view.currentSummary.meters || 0),
        'قيمة الإنتاجية': Number(view.currentSummary.revenue || 0),
        'متوسط سعر المتر': Number(view.currentSummary.avgPrice || 0),
        'مستحقات فريق التنفيذ': Number(view.currentLabor || 0),
        'نسبة الحضور %': Number(view.currentAtt.rate || 0),
        'الحضور': Number(view.currentAtt.present || 0),
        'الغياب': Number(view.currentAtt.absent || 0),
      }],
    },
    {
      name: 'عمليات الدورة',
      rows: (query.data?.currentRows || []).map((row) => ({
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
        'حالة المراجعة': row.review_status === 'reviewed' ? 'تمت المراجعة' : 'لم تتم',
        'الملاحظات': row.note || '',
      })),
    },
    {
      name: 'ملخص المشاريع',
      rows: view.projects.map((row) => ({
        'المشروع': row.name || '—',
        'عدد العمليات': Number(row.tasks || 0),
        'الأمتار': Number(row.meters || 0),
        'قيمة الإنتاجية': Number(row.revenue || 0),
      })),
    },
    {
      name: 'أداء الأفراد',
      rows: view.people.map((row) => ({
        'الاسم': row.person_name || '—',
        'الدور': roleLabels[row.role] || row.role || '—',
        'عدد العمليات': Number(row.tasks || 0),
        'الأمتار': Number(row.meters || 0),
        'المستحقات': Number(row.earnings || 0),
      })),
    },
  ]

  const executiveExcelSheets = [
    ...dashboardExportSheets,
    {
      name: 'ملخص القطاعات',
      rows: view.sections.map((row) => ({
        'القطاع': row.name || '—',
        'عدد العمليات': Number(row.tasks || 0),
        'الأمتار': Number(row.meters || 0),
        'قيمة الإنتاجية': Number(row.revenue || 0),
      })),
    },
    {
      name: 'الحضور والغياب',
      rows: (query.data?.currentAttendance || []).map((row) => ({
        'الاسم': row.person_name || '—',
        'الدور': roleLabels[row.role] || row.role || '—',
        'التاريخ': date(row.attendance_date),
        'الحالة': row.status === 'present' ? 'حاضر' : row.status === 'absent' ? 'غياب' : 'قادم',
        'نوع الغياب': row.absence_type === 'excused' ? 'بإذن' : row.absence_type === 'unexcused' ? 'بدون إذن' : '—',
        'الملاحظات': row.note || '',
      })),
    },
    {
      name: 'مقارنة الأيام',
      rows: view.dayComparison.map((row) => ({
        'اليوم': row.label,
        [monthName(monthKey)]: Number(row.current || 0),
        [monthName(view.previousKey)]: Number(row.previous || 0),
        'التغير': Number(row.current || 0) - Number(row.previous || 0),
      })),
    },
    {
      name: 'التنبيهات',
      rows: view.alerts.length ? view.alerts.map((alert, index) => ({
        '#': index + 1,
        'النوع': alert.tone === 'danger' ? 'حرج' : alert.tone === 'warning' ? 'تنبيه' : 'معلومة',
        'العنوان': alert.title,
        'القيمة': alert.value,
        'التفاصيل': alert.text,
      })) : [{
        '#': 1,
        'النوع': 'سليم',
        'العنوان': 'لا توجد تنبيهات تشغيلية',
        'القيمة': 0,
        'التفاصيل': 'لم يتم رصد حالات واضحة تحتاج تدخلًا في الدورة الحالية.',
      }],
    },
  ]

  const executiveExcel = {
    filename: `stc-productivity-${monthKey}`,
    title: `STC PRODUCTIVITY REPORT — ${monthName(monthKey)}`,
    subtitle: `الدورة من ${date(selectedCycle?.cycle_start)} إلى ${date(selectedCycle?.cycle_end)} · مقارنة عادلة حتى ${date(view.currentCutoff)}`,
    kpis: [
      { label: 'العمليات', value: Number(view.currentSummary.tasks || 0) },
      { label: 'إجمالي الأمتار', value: Number(view.currentSummary.meters || 0) },
      { label: 'قيمة الإنتاجية', value: Number(view.currentSummary.revenue || 0) },
      { label: 'متوسط سعر المتر', value: Number(view.currentSummary.avgPrice || 0) },
      { label: 'مستحقات الفريق', value: Number(view.currentLabor || 0) },
      { label: 'نسبة الحضور %', value: Number(view.currentAtt.rate || 0) },
    ],
    highlights: [
      { title: 'أعلى مشروع تنفيذًا', value: view.topProject ? `${view.topProject.name} · ${number(view.topProject.meters)} م` : '—' },
      { title: 'أقل مشروع تنفيذًا', value: view.lowProject ? `${view.lowProject.name} · ${number(view.lowProject.meters)} م` : '—' },
      { title: 'أعلى قطاع', value: view.topSection ? `${view.topSection.name} · ${number(view.topSection.meters)} م` : '—' },
      { title: 'الإنتاجية ÷ المستحقات', value: `${number(view.productivityPerLabor, 2)}×` },
      ...view.alerts,
    ],
    sheets: executiveExcelSheets,
  }

  return (
    <div className="page-stack management-dashboard">
      <section className="hero-strip dashboard-hero management-dashboard-hero">
        <div>
          <span className="eyebrow">MANAGEMENT DASHBOARD</span>
          <h2>لوحة الإدارة التنفيذية</h2>
          <p>مقارنة حتى اليوم {view.elapsedDays} من الدورة مع نفس عدد الأيام من {monthName(view.previousKey)} — عشان المقارنة ما تتظلمش بسبب دورة غير مكتملة.</p>
        </div>
        <div className="hero-strip__mark"><Gauge size={34} /></div>
      </section>

      <section className="dashboard-export-toolbar">
        <div className="dashboard-export-toolbar__copy">
          <strong>تصدير لوحة الإنتاجية</strong>
          <span>ملخص الدورة والعمليات والمشاريع وأداء الأفراد</span>
        </div>
        <ExportButtons
          filename={`dashboard-${monthKey}`}
          excelSheets={dashboardExportSheets}
          executiveExcel={executiveExcel}
          hideQuickExcel
        />
      </section>

      <section className="executive-kpi-grid">
        <ExecutiveKpi icon={BriefcaseBusiness} label="العمليات" value={number(view.currentSummary.tasks)} current={view.currentSummary.tasks} previous={view.previousSummary.tasks} helper="مقارنة بنفس عدد الأيام من الدورة السابقة" />
        <ExecutiveKpi icon={Ruler} label="الأمتار" value={`${number(view.currentSummary.meters)} م`} current={view.currentSummary.meters} previous={view.previousSummary.meters} helper="إجمالي التنفيذ المسجل" />
        <ExecutiveKpi icon={TrendingUp} label="قيمة الإنتاجية" value={money(view.currentSummary.revenue)} current={view.currentSummary.revenue} previous={view.previousSummary.revenue} helper="حسب أسعار القطاعات التاريخية" tone="success" />
        <ExecutiveKpi icon={BarChart3} label="متوسط سعر المتر" value={money(view.currentSummary.avgPrice)} current={view.currentSummary.avgPrice} previous={view.previousSummary.avgPrice} helper="الإنتاجية ÷ الأمتار" />
        <ExecutiveKpi icon={CircleDollarSign} label="مستحقات فريق التنفيذ" value={money(view.currentLabor)} current={view.currentLabor} previous={view.previousLabor} helper="فنيين + مساعدين + عمال" tone="amber" />
        <ExecutiveKpi icon={CalendarCheck2} label="نسبة الحضور" value={`${number(view.currentAtt.rate, 1)}%`} current={view.currentAtt.rate} previous={view.previousAtt.rate} helper={`${number(view.currentAtt.present)} حضور · ${number(view.currentAtt.absent)} غياب`} />
      </section>

      <section className="management-quick-grid">
        <article className="management-quick-card">
          <span>أعلى مشروع تنفيذًا</span>
          <strong>{view.topProject?.name || '—'}</strong>
          <small>{view.topProject ? `${number(view.topProject.meters)} م · ${money(view.topProject.revenue)}` : 'لا توجد بيانات'}</small>
        </article>
        <article className="management-quick-card">
          <span>أقل مشروع تنفيذًا</span>
          <strong>{view.lowProject?.name || '—'}</strong>
          <small>{view.lowProject ? `${number(view.lowProject.meters)} م · ${number(view.lowProject.tasks)} عملية` : 'لا توجد بيانات'}</small>
        </article>
        <article className="management-quick-card">
          <span>أعلى قطاع</span>
          <strong>{view.topSection?.name || '—'}</strong>
          <small>{view.topSection ? `${number(view.topSection.meters)} م · ${number(view.topSection.tasks)} عملية` : 'لا توجد بيانات'}</small>
        </article>
        <article className="management-quick-card">
          <span>الإنتاجية مقابل المستحقات</span>
          <strong>{number(view.productivityPerLabor, 2)}×</strong>
          <small>قيمة الإنتاجية ÷ مستحقات فريق التنفيذ</small>
        </article>
      </section>

      <section className="analytics-grid analytics-grid-main">
        <section className="panel chart-panel dashboard-chart-large">
          <header className="panel-header">
            <div><h3>الأمتار — الدورة الحالية مقابل السابقة</h3><p>مقارنة يوم بيوم لنفس عدد الأيام</p></div>
            <span className="chart-badge">Fair Comparison</span>
          </header>
          <div className="chart-wrap chart-wrap-large">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.dayComparison} margin={{ top: 18, right: 15, left: 8, bottom: 10 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(37,58,85,.12)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => `${number(value)} م`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="current" name={monthName(monthKey)} stroke="var(--blue-600)" strokeWidth={2.8} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="previous" name={monthName(view.previousKey)} stroke="var(--navy-800)" strokeWidth={2.2} strokeDasharray="6 4" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel management-alerts">
          <header className="panel-header">
            <div><h3>تنبيهات المراجعة</h3><p>نقاط تستحق النظر، وليست أحكامًا آلية.</p></div>
            <AlertTriangle size={18} />
          </header>
          <div className="management-alert-list">
            {view.alerts.map((alert) => (
              <div className={`management-alert alert-${alert.tone}`} key={alert.title}>
                <strong>{alert.value}</strong>
                <div><span>{alert.title}</span><small>{alert.text}</small></div>
              </div>
            ))}
            {!view.alerts.length ? <div className="management-all-clear"><CalendarCheck2 size={20} /><span>لا توجد تنبيهات تشغيلية واضحة في البيانات الحالية.</span></div> : null}
          </div>
        </section>
      </section>

      <section className="analytics-grid">
        <section className="panel chart-panel">
          <header className="panel-header">
            <div><h3>المشاريع حسب الأمتار</h3><p>أعلى المشاريع في الدورة الحالية</p></div>
            <span className="chart-badge">Projects</span>
          </header>
          <div className="chart-wrap">
            {projectChartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectChartData} margin={{ top: 12, right: 8, left: 4, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(37,58,85,.12)" />
                  <XAxis dataKey="name" angle={-18} textAnchor="end" height={72} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => `${number(value)} م`} />
                  <Bar dataKey="meters" name="الأمتار" radius={[8, 8, 0, 0]} fill="var(--blue-600)" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
        </section>

        <section className="panel">
          <header className="panel-header"><div><h3>أداء الأفراد</h3><p>حسب المستحقات ثم حجم التنفيذ</p></div><Users size={18} /></header>
          <div className="management-people-list">
            {topPeople.map((person, index) => (
              <div className="management-person-row" key={person.person_id}>
                <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{person.person_name}</strong><small>{roleLabels[person.role] || person.role} · {number(person.tasks)} عملية · {number(person.meters)} م</small></div>
                <b>{money(person.earnings)}</b>
              </div>
            ))}
            {!topPeople.length ? <EmptyState /> : null}
          </div>
        </section>
      </section>

      <section className="panel management-project-table">
        <header className="panel-header">
          <div><h3>قراءة المشاريع</h3><p>الحجم التنفيذي والقيمة ومتوسط العائد لكل متر.</p></div>
          <BriefcaseBusiness size={18} />
        </header>
        <div className="data-table-wrap">
          <table className="data-table readable-table">
            <thead><tr><th>المشروع</th><th>العمليات</th><th>الأمتار</th><th>قيمة الإنتاجية</th><th>متوسط / متر</th></tr></thead>
            <tbody>
              {view.projects.map((project) => (
                <tr key={project.name}>
                  <td className="strong-cell">{project.name}</td>
                  <td>{number(project.tasks)}</td>
                  <td>{number(project.meters)} م</td>
                  <td>{money(project.revenue)}</td>
                  <td>{money(project.meters > 0 ? project.revenue / project.meters : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
