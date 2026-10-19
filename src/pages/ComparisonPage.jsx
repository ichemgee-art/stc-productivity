import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, BarChart3, CalendarCheck2, CalendarX2, CircleDollarSign, Ruler, TrendingDown, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCycle } from '../context/CycleContext'
import { appService } from '../services/appService'
import { date, money, monthName, number } from '../lib/format'
import ExportButtons from '../components/ExportButtons'
import EmptyState from '../components/EmptyState'

const pct = (current, previous) => {
  const a = Number(current || 0)
  const b = Number(previous || 0)
  if (!b && !a) return 0
  if (!b) return null
  return ((a - b) / Math.abs(b)) * 100
}

const deltaLabel = (current, previous) => {
  const value = pct(current, previous)
  if (value == null) return 'جديد'
  const sign = value > 0 ? '+' : ''
  return `${sign}${number(value)}%`
}

const mergeNamed = (left = [], right = [], nameKey = 'name') => {
  const map = new Map()
  left.forEach((item) => {
    const name = item[nameKey] || item.person_name
    map.set(name, { name, previous: item, current: null })
  })
  right.forEach((item) => {
    const name = item[nameKey] || item.person_name
    const existing = map.get(name) || { name, previous: null, current: null }
    existing.current = item
    map.set(name, existing)
  })
  return [...map.values()].sort((a, b) => {
    const current = Number(b.current?.meters || b.current?.earnings || 0) - Number(a.current?.meters || a.current?.earnings || 0)
    if (current !== 0) return current
    return a.name.localeCompare(b.name, 'ar')
  })
}

const peopleTotals = (data) => {
  const all = [...(data.engineers || []), ...(data.technicians || []), ...(data.assistants || []), ...(data.workers || [])]
  return {
    present: all.reduce((sum, row) => sum + Number(row.present_days || 0), 0),
    absent: all.reduce((sum, row) => sum + Number(row.absent_days || 0), 0),
  }
}

function CompareStat({ label, current, previous, format = number, icon: Icon }) {
  const change = pct(current, previous)
  const up = change == null || change >= 0
  return (
    <article className="compare-stat">
      <div className="compare-stat__head"><span>{Icon ? <Icon size={17} /> : null}{label}</span><span className={`compare-delta ${up ? 'up' : 'down'}`}>{up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{deltaLabel(current, previous)}</span></div>
      <div className="compare-stat__values">
        <div><small>الشهر الحالي</small><strong>{format(current)}</strong></div>
        <ArrowLeftRight size={18} />
        <div><small>الشهر السابق</small><strong>{format(previous)}</strong></div>
      </div>
    </article>
  )
}

function NamedComparisonTable({ title, rows, moneyMode = false, peopleMode = false }) {
  if (!rows.length) return <section className="comparison-section"><div className="comparison-section__head"><h3>{title}</h3></div><EmptyState /></section>
  return (
    <section className="comparison-section">
      <div className="comparison-section__head"><h3>{title}</h3><span>{rows.length} بند</span></div>
      <div className="data-table-wrap">
        <table className="data-table comparison-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>عمليات السابق</th><th>عمليات الحالي</th><th>فرق العمليات</th>
              <th>{peopleMode ? 'مستحق السابق' : 'أمتار السابق'}</th>
              <th>{peopleMode ? 'مستحق الحالي' : 'أمتار الحالي'}</th>
              <th>التغير</th>
              {peopleMode ? <><th>حضور السابق</th><th>حضور الحالي</th><th>غياب السابق</th><th>غياب الحالي</th></> : null}
              {moneyMode ? <><th>إيراد السابق</th><th>إيراد الحالي</th></> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const prev = row.previous || {}
              const curr = row.current || {}
              const prevValue = peopleMode ? Number(prev.earnings || 0) : Number(prev.meters || 0)
              const currValue = peopleMode ? Number(curr.earnings || 0) : Number(curr.meters || 0)
              const change = pct(currValue, prevValue)
              const up = change == null || change >= 0
              return (
                <tr key={row.name}>
                  <td className="strong-cell">{row.name}</td>
                  <td>{number(prev.tasks)}</td><td>{number(curr.tasks)}</td><td>{number(Number(curr.tasks || 0) - Number(prev.tasks || 0))}</td>
                  <td>{peopleMode ? money(prevValue) : `${number(prevValue)} م`}</td>
                  <td>{peopleMode ? money(currValue) : `${number(currValue)} م`}</td>
                  <td><span className={`compare-delta ${up ? 'up' : 'down'}`}>{deltaLabel(currValue, prevValue)}</span></td>
                  {peopleMode ? <><td>{number(prev.present_days)}</td><td>{number(curr.present_days)}</td><td>{number(prev.absent_days)}</td><td>{number(curr.absent_days)}</td></> : null}
                  {moneyMode ? <><td>{money(prev.revenue)}</td><td>{money(curr.revenue)}</td></> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function ComparisonPage() {
  const { cycles, monthKey } = useCycle()
  const printRef = useRef(null)
  const [currentKey, setCurrentKey] = useState('')
  const [previousKey, setPreviousKey] = useState('')

  useEffect(() => {
    if (!cycles.length || currentKey) return
    const currentIndex = Math.max(0, cycles.findIndex((cycle) => cycle.month_key === monthKey))
    const current = cycles[currentIndex] || cycles[0]
    const previous = cycles[currentIndex + 1] || cycles[1] || cycles[0]
    setCurrentKey(current.month_key)
    setPreviousKey(previous.month_key)
  }, [cycles, monthKey, currentKey])

  const query = useQuery({
    queryKey: ['cycle-comparison', previousKey, currentKey],
    queryFn: async () => {
      const [previous, current] = await Promise.all([
        appService.dashboard(previousKey),
        appService.dashboard(currentKey),
      ])
      return { previous, current }
    },
    enabled: Boolean(previousKey && currentKey),
  })

  const previousCycle = cycles.find((cycle) => cycle.month_key === previousKey)
  const currentCycle = cycles.find((cycle) => cycle.month_key === currentKey)
  const previous = query.data?.previous || {}
  const current = query.data?.current || {}
  const prevSummary = previous.summary || {}
  const currSummary = current.summary || {}
  const prevAttendance = peopleTotals(previous)
  const currAttendance = peopleTotals(current)

  const projectRows = useMemo(() => mergeNamed(previous.projects, current.projects), [previous.projects, current.projects])
  const sectionRows = useMemo(() => mergeNamed(previous.sections, current.sections), [previous.sections, current.sections])
  const engineerRows = useMemo(() => mergeNamed(previous.engineers, current.engineers, 'person_name'), [previous.engineers, current.engineers])
  const technicianRows = useMemo(() => mergeNamed(previous.technicians, current.technicians, 'person_name'), [previous.technicians, current.technicians])
  const assistantRows = useMemo(() => mergeNamed(previous.assistants, current.assistants, 'person_name'), [previous.assistants, current.assistants])
  const workerRows = useMemo(() => mergeNamed(previous.workers, current.workers, 'person_name'), [previous.workers, current.workers])

  const projectChartData = useMemo(() => projectRows
    .map((row) => ({
      name: row.name,
      previous: Number(row.previous?.meters || 0),
      current: Number(row.current?.meters || 0),
    }))
    .sort((a, b) => Math.max(b.previous, b.current) - Math.max(a.previous, a.current))
    .slice(0, 8), [projectRows])

  const peopleChartData = useMemo(() => [...technicianRows, ...assistantRows, ...workerRows]
    .map((row) => ({
      name: row.name,
      previous: Number(row.previous?.earnings || 0),
      current: Number(row.current?.earnings || 0),
    }))
    .sort((a, b) => Math.max(b.previous, b.current) - Math.max(a.previous, a.current))
    .slice(0, 10), [technicianRows, assistantRows, workerRows])

  const overviewRows = [
    ['إجمالي العمليات', prevSummary.tasks, currSummary.tasks],
    ['إجمالي الأمتار', prevSummary.meters, currSummary.meters],
    ['قيمة الإنتاجية', prevSummary.revenue, currSummary.revenue],
    ['متوسط سعر المتر', prevSummary.avg_price, currSummary.avg_price],
    ['عدد المشاريع', (previous.projects || []).length, (current.projects || []).length],
    ['عدد القطاعات المستخدمة', (previous.sections || []).length, (current.sections || []).length],
    ['إجمالي أيام الحضور', prevAttendance.present, currAttendance.present],
    ['إجمالي أيام الغياب', prevAttendance.absent, currAttendance.absent],
  ]

  const namedSheet = (rows, people = false, revenue = false) => rows.map((row) => ({
    'الاسم': row.name,
    'عمليات السابق': Number(row.previous?.tasks || 0),
    'عمليات الحالي': Number(row.current?.tasks || 0),
    [people ? 'مستحق السابق' : 'أمتار السابق']: Number(people ? row.previous?.earnings || 0 : row.previous?.meters || 0),
    [people ? 'مستحق الحالي' : 'أمتار الحالي']: Number(people ? row.current?.earnings || 0 : row.current?.meters || 0),
    'نسبة التغير %': (() => {
      const value = pct(people ? row.current?.earnings : row.current?.meters, people ? row.previous?.earnings : row.previous?.meters)
      return value == null ? 'جديد' : Number(value.toFixed(2))
    })(),
    ...(people ? {
      'حضور السابق': Number(row.previous?.present_days || 0),
      'حضور الحالي': Number(row.current?.present_days || 0),
      'غياب السابق': Number(row.previous?.absent_days || 0),
      'غياب الحالي': Number(row.current?.absent_days || 0),
    } : {}),
    ...(revenue ? {
      'إيراد السابق': Number(row.previous?.revenue || 0),
      'إيراد الحالي': Number(row.current?.revenue || 0),
    } : {}),
  }))

  const excelSheets = [
    { name: 'ملخص المقارنة', rows: overviewRows.map(([label, prev, curr]) => {
      const change = pct(curr, prev)
      return { 'المؤشر': label, 'الشهر السابق': Number(prev || 0), 'الشهر الحالي': Number(curr || 0), 'الفرق': Number(curr || 0) - Number(prev || 0), 'نسبة التغير %': change == null ? 'جديد' : Number(change.toFixed(2)) }
    }) },
    { name: 'المشاريع', rows: namedSheet(projectRows, false, true) },
    { name: 'القطاعات', rows: namedSheet(sectionRows, false, true) },
    { name: 'المهندسين', rows: namedSheet(engineerRows, true) },
    { name: 'الفنيين', rows: namedSheet(technicianRows, true) },
    { name: 'المساعدين', rows: namedSheet(assistantRows, true) },
    { name: 'العمال', rows: namedSheet(workerRows, true) },
  ]

  if (!cycles.length) return <div className="page-loader">جاري تجهيز دورات المقارنة...</div>

  return (
    <div className="page-stack" ref={printRef}>
      <section className="comparison-hero">
        <div><span className="eyebrow">MONTH-TO-MONTH</span><h2>مقارنة الشهور</h2><p>مقارنة تشغيلية شاملة بين دورتين: الإنتاجية، المشاريع، القطاعات، الحضور والغياب وأداء الأفراد.</p></div>
        <ArrowLeftRight size={34} />
      </section>

      <section className="comparison-controls" data-html2canvas-ignore="true">
        <label><span>الشهر السابق</span><select value={previousKey} onChange={(e) => setPreviousKey(e.target.value)}>{cycles.map((cycle) => <option key={cycle.month_key} value={cycle.month_key}>{monthName(cycle.month_key)}</option>)}</select></label>
        <span className="comparison-vs">VS</span>
        <label><span>الشهر الحالي</span><select value={currentKey} onChange={(e) => setCurrentKey(e.target.value)}>{cycles.map((cycle) => <option key={cycle.month_key} value={cycle.month_key}>{monthName(cycle.month_key)}</option>)}</select></label>
        <ExportButtons filename={`comparison-${previousKey}-vs-${currentKey}`} excelSheets={excelSheets} pdfTarget={printRef} compact />
      </section>

      <section className="comparison-periods">
        <div><strong>{monthName(previousKey)}</strong><span>{previousCycle ? `${date(previousCycle.cycle_start)} → ${date(previousCycle.cycle_end)}` : '—'}</span></div>
        <ArrowLeftRight size={20} />
        <div><strong>{monthName(currentKey)}</strong><span>{currentCycle ? `${date(currentCycle.cycle_start)} → ${date(currentCycle.cycle_end)}` : '—'}</span></div>
      </section>

      {query.isLoading ? <div className="page-loader">جاري حساب المقارنة...</div> : query.isError ? <div className="page-error">{query.error.message}</div> : (
        <>
          <section className="comparison-stats-grid">
            <CompareStat label="إجمالي العمليات" previous={prevSummary.tasks} current={currSummary.tasks} icon={BarChart3} />
            <CompareStat label="إجمالي الأمتار" previous={prevSummary.meters} current={currSummary.meters} icon={Ruler} />
            <CompareStat label="قيمة الإنتاجية" previous={prevSummary.revenue} current={currSummary.revenue} format={money} icon={CircleDollarSign} />
            <CompareStat label="متوسط سعر المتر" previous={prevSummary.avg_price} current={currSummary.avg_price} format={money} icon={TrendingUp} />
            <CompareStat label="أيام الحضور" previous={prevAttendance.present} current={currAttendance.present} icon={CalendarCheck2} />
            <CompareStat label="أيام الغياب" previous={prevAttendance.absent} current={currAttendance.absent} icon={CalendarX2} />
          </section>

          <section className="comparison-chart-grid">
            <section className="panel chart-panel comparison-chart-card">
              <header className="panel-header"><div><h3>المشاريع — مقارنة الأمتار</h3><p>أعلى المشاريع بين الشهرين</p></div><span className="chart-badge">Projects</span></header>
              <div className="chart-wrap chart-wrap-large">
                {projectChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectChartData} margin={{ top: 16, right: 10, left: 4, bottom: 55 }}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(37,58,85,.12)" />
                      <XAxis dataKey="name" angle={-18} textAnchor="end" height={76} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => `${number(value)} م`} contentStyle={{ borderRadius: 12, border: '1px solid rgba(37,58,85,.16)', fontFamily: 'Cairo', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="previous" name={monthName(previousKey)} fill="var(--navy-800)" radius={[7, 7, 0, 0]} />
                      <Bar dataKey="current" name={monthName(currentKey)} fill="var(--blue-500)" radius={[7, 7, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </section>

            <section className="panel chart-panel comparison-chart-card">
              <header className="panel-header"><div><h3>الأفراد — مقارنة المستحقات</h3><p>أعلى المستحقات بين الشهرين</p></div><span className="chart-badge">Team</span></header>
              <div className="chart-wrap chart-wrap-large">
                {peopleChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peopleChartData} layout="vertical" margin={{ top: 12, right: 20, left: 50, bottom: 12 }}>
                      <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="rgba(37,58,85,.12)" />
                      <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => money(value)} contentStyle={{ borderRadius: 12, border: '1px solid rgba(37,58,85,.16)', fontFamily: 'Cairo', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="previous" name={monthName(previousKey)} fill="var(--navy-800)" radius={[0, 7, 7, 0]} />
                      <Bar dataKey="current" name={monthName(currentKey)} fill="var(--blue-500)" radius={[0, 7, 7, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </section>
          </section>

          <NamedComparisonTable title="مقارنة المشاريع" rows={projectRows} moneyMode />
          <NamedComparisonTable title="مقارنة القطاعات" rows={sectionRows} moneyMode />
          <NamedComparisonTable title="مقارنة المهندسين" rows={engineerRows} peopleMode />
          <NamedComparisonTable title="مقارنة الفنيين" rows={technicianRows} peopleMode />
          <NamedComparisonTable title="مقارنة المساعدين" rows={assistantRows} peopleMode />
          <NamedComparisonTable title="مقارنة العمال" rows={workerRows} peopleMode />
        </>
      )}
    </div>
  )
}
