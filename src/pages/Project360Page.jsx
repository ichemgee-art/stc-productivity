import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight, BarChart3, BriefcaseBusiness, CalendarDays, CircleDollarSign,
  ClipboardList, Clock3, FileText, FolderKanban, Layers3, MapPin,
  PackageCheck, Ruler, Users,
} from 'lucide-react'
import { appService } from '../services/appService'
import { date, money, number } from '../lib/format'
import { projectCategoryLabel } from '../lib/projectProgress'
import EmptyState from '../components/EmptyState'

const splitPeople = (value) => String(value || '')
  .split(/[،,]/)
  .map((item) => item.trim())
  .filter(Boolean)

const uniqueNames = (rows, key) => [...new Set(rows.flatMap((row) => splitPeople(row[key])))]

const eventDate = (value) => value ? String(value).slice(0, 10) : ''

export default function Project360Page() {
  const { projectId } = useParams()

  const query = useQuery({
    queryKey: ['project-360', projectId],
    queryFn: () => appService.project360(projectId),
    enabled: Boolean(projectId),
  })

  const view = useMemo(() => {
    if (!query.data) return null
    const { project, progress, operations = [] } = query.data

    const totalMeters = operations.reduce((sum, row) => sum + Number(row.meters || 0), 0)
    const totalValue = operations.reduce((sum, row) => sum + Number(row.total || 0), 0)
    const latestOperation = operations[0] || null

    const sectionMap = new Map()
    operations.forEach((row) => {
      const name = row.section || 'بدون قطاع'
      const current = sectionMap.get(name) || { name, operations: 0, meters: 0, value: 0 }
      current.operations += 1
      current.meters += Number(row.meters || 0)
      current.value += Number(row.total || 0)
      sectionMap.set(name, current)
    })
    const sections = [...sectionMap.values()].sort((a, b) => b.meters - a.meters)

    const teamGroups = [
      { label: 'المهندسين', names: uniqueNames(operations, 'engineers') },
      { label: 'الفنيين', names: uniqueNames(operations, 'technicians') },
      { label: 'المساعدين', names: uniqueNames(operations, 'assistants') },
      { label: 'العمال', names: uniqueNames(operations, 'workers') },
    ].filter((group) => group.names.length)

    const reviewEvents = progress ? [
      progress.review_yahya_date ? { date: progress.review_yahya_date, type: 'review', title: 'مراجعة م. يحيي حسين', detail: 'تم تسجيل تاريخ مراجعة للمشروع.' } : null,
      progress.review_marina_date ? { date: progress.review_marina_date, type: 'review', title: 'مراجعة م. مارينا سامي', detail: 'تم تسجيل تاريخ مراجعة للمشروع.' } : null,
      progress.review_abdelrahman_date ? { date: progress.review_abdelrahman_date, type: 'review', title: 'مراجعة م. عبدالرحمن حسين', detail: 'تم تسجيل تاريخ مراجعة للمشروع.' } : null,
    ].filter(Boolean) : []

    const progressEvent = progress?.updated_at ? [{
      date: eventDate(progress.updated_at),
      type: 'progress',
      title: 'تحديث متابعة المشروع',
      detail: `${projectCategoryLabel(progress.project_category, { short: true })} · ${number(progress.executed_quantity)} م منفذ`,
    }] : []

    const productivityEvents = operations.slice(0, 10).map((row) => ({
      date: row.work_date,
      type: 'productivity',
      title: `إنتاجية ${number(row.meters)} م`,
      detail: [row.section, row.engineers || row.technicians || row.workers].filter(Boolean).join(' · '),
    }))

    const timeline = [...progressEvent, ...reviewEvents, ...productivityEvents]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 12)

    const reviewDates = progress
      ? [progress.review_yahya_date, progress.review_marina_date, progress.review_abdelrahman_date].filter(Boolean).sort().reverse()
      : []

    return {
      project,
      progress,
      operations,
      totalMeters,
      totalValue,
      latestOperation,
      sections,
      teamGroups,
      timeline,
      lastReviewDate: reviewDates[0] || null,
    }
  }, [query.data])

  if (query.isLoading) return <div className="page-loader">جاري تجهيز Project 360...</div>
  if (query.isError) return <div className="page-error">{query.error?.message || 'تعذر تحميل المشروع'}</div>
  if (!view) {
    return (
      <EmptyState
        title="المشروع غير موجود"
        description="المشروع المطلوب غير موجود أو لم يعد متاحًا."
        actionLabel="العودة للمشاريع"
        actionTo="/projects"
      />
    )
  }

  const { project, progress, operations } = view
  const executionPercent = progress?.execution_percent == null ? null : Number(progress.execution_percent)
  const contractQuantity = Number(progress?.contract_quantity || 0)
  const executedQuantity = Number(progress?.executed_quantity || 0)

  return (
    <div className="page-stack project-360-page">
      <section className="project-360-hero">
        <div className="project-360-hero__main">
          <Link className="project-360-back" to="/projects"><ArrowRight size={15} /> المشاريع</Link>
          <div className="project-360-title">
            <span className="project-360-icon"><FolderKanban size={24} /></span>
            <div>
              <span className="eyebrow">PROJECT 360</span>
              <h2>{project.name}</h2>
              <p>
                {progress?.location ? <><MapPin size={13} /> {progress.location}</> : 'كل بيانات المشروع التشغيلية في مكان واحد'}
              </p>
            </div>
          </div>
        </div>
        <div className="project-360-hero__status">
          <span className={`project-360-project-status status-${progress?.project_category || 'unclassified'}`}>
            {projectCategoryLabel(progress?.project_category, { short: true })}
          </span>
          <small>{project.active ? 'المشروع نشط في النظام' : 'المشروع معطل للإدخالات الجديدة'}</small>
        </div>
      </section>

      <nav className="project-360-tabs" aria-label="أقسام المشروع">
        <span className="is-active"><BarChart3 size={15} /> نظرة عامة</span>
        <span className="is-future"><BriefcaseBusiness size={15} /> العقود <b>قريبًا</b></span>
        <span className="is-future"><PackageCheck size={15} /> التوريدات <b>قريبًا</b></span>
        <span className="is-future"><CircleDollarSign size={15} /> الدفعات <b>قريبًا</b></span>
        <span className="is-future"><FileText size={15} /> المستندات <b>قريبًا</b></span>
      </nav>

      <section className="project-360-kpis">
        <article>
          <span><ClipboardList size={17} /> إجمالي العمليات</span>
          <strong>{number(operations.length)}</strong>
          <small>كل عمليات الإنتاجية التاريخية</small>
        </article>
        <article>
          <span><Ruler size={17} /> أمتار الإنتاجية</span>
          <strong>{number(view.totalMeters)} م</strong>
          <small>{view.latestOperation ? `آخر تنفيذ ${date(view.latestOperation.work_date)}` : 'لا يوجد تنفيذ مسجل'}</small>
        </article>
        <article>
          <span><CircleDollarSign size={17} /> قيمة الإنتاجية</span>
          <strong>{money(view.totalValue)}</strong>
          <small>إجمالي قيمة العمليات المسجلة</small>
        </article>
        <article>
          <span><BarChart3 size={17} /> نسبة التنفيذ</span>
          <strong>{executionPercent == null ? '—' : `${number(executionPercent)}%`}</strong>
          <small>{contractQuantity ? `${number(executedQuantity)} من ${number(contractQuantity)} م` : 'لا توجد كمية عقد مسجلة'}</small>
        </article>
      </section>

      <section className="project-360-grid project-360-grid--primary">
        <section className="panel project-360-progress">
          <header className="panel-header">
            <div><h3>موقف المشروع الحالي</h3><p>آخر بيانات مسجلة في متابعة المشاريع</p></div>
            <ClipboardList size={18} />
          </header>
          {progress ? (
            <div className="project-360-progress__body">
              <div className="project-360-progress-bar">
                <div>
                  <span>نسبة التنفيذ</span>
                  <strong>{executionPercent == null ? '—' : `${number(executionPercent)}%`}</strong>
                </div>
                <div className="project-360-progress-track">
                  <i style={{ width: `${Math.min(Math.max(executionPercent || 0, 0), 100)}%` }} />
                </div>
              </div>
              <div className="project-360-facts">
                <div><span>كميات العقد</span><strong>{progress.contract_quantity == null ? '—' : `${number(progress.contract_quantity)} م`}</strong></div>
                <div><span>الكميات المنفذة</span><strong>{`${number(progress.executed_quantity)} م`}</strong></div>
                <div><span>الموقع</span><strong>{progress.location || '—'}</strong></div>
                <div><span>نوع التعاقد</span><strong>{progress.contract_type || '—'}</strong></div>
                <div><span>آخر مراجعة</span><strong>{date(view.lastReviewDate)}</strong></div>
                <div><span>مصدر التنفيذ</span><strong>{progress.execution_mode === 'linked' ? 'مرتبط بالإنتاجية' : 'يدوي'}</strong></div>
              </div>
              {progress.financial_status ? (
                <div className="project-360-text-block">
                  <span>الموقف المالي</span>
                  <p>{progress.financial_status}</p>
                </div>
              ) : null}
              {progress.notes ? (
                <div className="project-360-text-block">
                  <span>ملاحظات المتابعة</span>
                  <p>{progress.notes}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title="لا توجد متابعة للمشروع" description="المشروع موجود في الإنتاجية لكن لم يتم ربطه بمتابعة مشاريع حتى الآن." />
          )}
        </section>

        <section className="panel project-360-team">
          <header className="panel-header">
            <div><h3>فريق المشروع</h3><p>الأفراد الذين ظهروا في عمليات المشروع</p></div>
            <Users size={18} />
          </header>
          <div className="project-360-team__body">
            {progress?.responsible_team ? (
              <div className="project-360-responsible">
                <span>الطاقم المسئول عن الاستكمال</span>
                <strong>{progress.responsible_team}</strong>
              </div>
            ) : null}
            {view.teamGroups.map((group) => (
              <div className="project-360-team-group" key={group.label}>
                <div><span>{group.label}</span><b>{group.names.length}</b></div>
                <div className="project-360-chips">
                  {group.names.map((name) => <span key={name}>{name}</span>)}
                </div>
              </div>
            ))}
            {!view.teamGroups.length && !progress?.responsible_team ? (
              <EmptyState title="لا يوجد فريق مسجل" description="لم يظهر أفراد مرتبطون بعمليات هذا المشروع حتى الآن." />
            ) : null}
          </div>
        </section>
      </section>

      <section className="project-360-grid">
        <section className="panel">
          <header className="panel-header">
            <div><h3>القطاعات داخل المشروع</h3><p>ترتيب القطاعات حسب الأمتار المنفذة</p></div>
            <Layers3 size={18} />
          </header>
          <div className="project-360-section-list">
            {view.sections.slice(0, 8).map((section, index) => (
              <div className="project-360-section-row" key={section.name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{section.name}</strong><small>{number(section.operations)} عملية</small></div>
                <b>{number(section.meters)} م</b>
              </div>
            ))}
            {!view.sections.length ? <EmptyState title="لا توجد قطاعات" /> : null}
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <div><h3>Timeline المشروع</h3><p>أحدث التنفيذات والمراجعات والتحديثات</p></div>
            <Clock3 size={18} />
          </header>
          <div className="project-360-timeline">
            {view.timeline.map((event, index) => (
              <div className={`project-360-timeline__item type-${event.type}`} key={`${event.type}-${event.date}-${index}`}>
                <span className="project-360-timeline__dot" />
                <div>
                  <small>{date(event.date)}</small>
                  <strong>{event.title}</strong>
                  <p>{event.detail || '—'}</p>
                </div>
              </div>
            ))}
            {!view.timeline.length ? <EmptyState title="لا يوجد نشاط تاريخي" /> : null}
          </div>
        </section>
      </section>

      <section className="panel project-360-recent">
        <header className="panel-header">
          <div><h3>آخر عمليات الإنتاجية</h3><p>أحدث 8 عمليات مسجلة على المشروع</p></div>
          <Link className="btn btn-ghost btn-sm" to={`/productivity?q=${encodeURIComponent(project.name)}`}>عرض كل العمليات</Link>
        </header>
        {operations.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>التاريخ</th><th>القطاع</th><th>الأمتار</th><th>سعر المتر</th><th>الإجمالي</th><th>الفريق</th><th>الملاحظات</th></tr></thead>
              <tbody>
                {operations.slice(0, 8).map((row) => (
                  <tr key={row.id}>
                    <td>{date(row.work_date)}</td>
                    <td className="strong-cell">{row.section || '—'}</td>
                    <td>{number(row.meters)} م</td>
                    <td>{money(row.price_per_meter)}</td>
                    <td className="strong-cell">{money(row.total)}</td>
                    <td>{[row.engineers, row.technicians, row.assistants, row.workers].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="لا توجد عمليات إنتاجية" />}
      </section>
    </div>
  )
}
