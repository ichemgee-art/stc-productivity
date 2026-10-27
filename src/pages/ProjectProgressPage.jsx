import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PROJECT_PROGRESS_CATEGORIES, projectCategoryLabel, progressMetersById } from '../lib/projectProgress'
import { appService } from '../services/appService'
import { useAuth } from '../context/AuthContext'
import { useFeedback } from '../context/FeedbackContext'
import Modal from '../components/Modal'
import ProjectProgressForm from '../components/ProjectProgressForm'
import EmptyState from '../components/EmptyState'
import ExportButtons from '../components/ExportButtons'
import { smartIncludes } from '../lib/smartSearch'
import { useSessionState } from '../lib/sessionCache'

const displayDate = (value) => {
  if (!value) return '—'
  const [y, m, d] = String(value).split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

const displayNumber = (value) => {
  if (value == null || value === '') return '—'
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—'
}

export default function ProjectProgressPage() {
  const { permissions } = useAuth()
  const feedback = useFeedback()
  const queryClient = useQueryClient()
  const [search, setSearch] = useSessionState('page:project-progress:search', '')
  const [source, setSource] = useSessionState('page:project-progress:source', '')
  const [category, setCategory] = useSessionState('page:project-progress:category', '')
  const [editing, setEditing] = useState(null)

  const rowsQuery = useQuery({
    queryKey: ['project-progress', 'rows'],
    queryFn: appService.projectProgressRows,
  })
  const refsQuery = useQuery({ queryKey: ['references'], queryFn: appService.references })
  const productivityQuery = useQuery({
    queryKey: ['project-progress', 'historical-productivity'],
    queryFn: appService.projectProgressProductivity,
  })

  const projectMetersMap = useMemo(() => progressMetersById(productivityQuery.data), [productivityQuery.data])

  const rows = rowsQuery.data || []
  const categoryCounts = useMemo(() => rows.reduce((counts, row) => {
    const key = row.project_category || '__unclassified__'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {}), [rows])

  const filtered = useMemo(() => rows.filter((row) => {
    if (source && row.execution_mode !== source) return false
    if (category === '__unclassified__' && row.project_category) return false
    if (category && category !== '__unclassified__' && row.project_category !== category) return false
    return smartIncludes(
      search,
      row.display_number,
      row.project,
      row.location,
      projectCategoryLabel(row.project_category),
      row.financial_status,
      row.contract_type,
      row.responsible_team,
      row.notes,
      row.contract_quantity,
      row.executed_quantity,
      row.execution_percent,
    )
  }), [rows, search, source, category])

  const excelSheets = useMemo(() => [{
    name: 'متابعة المشاريع',
    subtitle: `STC Productivity System · ${filtered.length} مشروع معروض`,
    rows: filtered.map((row) => ({
      'رقم': row.display_number ?? '',
      'المشروع': row.project || '',
      'الموقع': row.location || '',
      'حالة المشروع': projectCategoryLabel(row.project_category),
      'آخر مراجعة - م. يحيي حسين': displayDate(row.review_yahya_date),
      'آخر مراجعة - م. مارينا سامي': displayDate(row.review_marina_date),
      'آخر مراجعة - م. عبدالرحمن حسين': displayDate(row.review_abdelrahman_date),
      'كميات العقد': row.contract_quantity == null ? '' : Number(row.contract_quantity),
      'الكميات المنفذة': row.executed_quantity == null ? '' : Number(row.executed_quantity),
      'نسبة التنفيذ %': row.execution_percent == null ? '' : Number(row.execution_percent),
      'الموقف المالي': row.financial_status || '',
      'نوع التعاقد': row.contract_type || '',
      'الطاقم المسئول': row.responsible_team || '',
      'ملاحظات': row.notes || '',
    })),
  }], [filtered])

  const mutation = useMutation({
    mutationFn: appService.saveProjectProgress,
    onSuccess: async (_data, variables) => {
      setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['project-progress'] })
      feedback.success(
        'تم حفظ التعديل',
        `تم تحديث متابعة ${variables.project_name || 'المشروع'} والحسابات اتحدثت تلقائيًا.`,
      )
    },
    onError: (error) => feedback.error('تعذر حفظ التعديل', error.message || 'حدث خطأ غير متوقع'),
  })

  const deleteMutation = useMutation({
    mutationFn: appService.deleteProjectProgress,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-progress'] })
      feedback.deleted('تم حذف المتابعة', 'تم حذف السجل من متابعة المشاريع بنجاح.')
    },
    onError: (error) => feedback.error('تعذر حذف المتابعة', error.message || 'حدث خطأ غير متوقع'),
  })

  const openEdit = (row) => {
    setEditing(row)
    feedback.info('وضع التعديل', `تم فتح متابعة ${row.project || 'المشروع'} للتعديل.`, 2200)
  }

  const remove = async (row) => {
    const accepted = await feedback.confirm({
      title: 'حذف متابعة المشروع؟',
      message: 'الحذف نهائي لهذا السجل فقط ولن يحذف المشروع أو عمليات الإنتاجية.',
      details: `${row.project || 'مشروع'} · رقم ${row.display_number ?? '—'}${row.source === 'excel_import' ? ' · مستورد من Excel' : ''}`,
      confirmLabel: 'حذف المتابعة',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    })
    if (!accepted) return
    await deleteMutation.mutateAsync(row.id)
  }

  if (rowsQuery.isLoading || refsQuery.isLoading || productivityQuery.isLoading) return <div className="page-loader">جاري تحميل متابعة المشاريع...</div>
  if (rowsQuery.isError || refsQuery.isError || productivityQuery.isError) return <div className="page-error">{rowsQuery.error?.message || refsQuery.error?.message || productivityQuery.error?.message || 'تعذر تحميل المتابعة'}</div>

  return (
    <div className="project-progress-page">
      <section className="progress-table-toolbar">
        <div className="progress-table-toolbar__title">
          <div>
            <strong>متابعة المشاريع</strong>
            <small>{filtered.length} مشروع ظاهر من إجمالي {rows.length} · الكميات المرتبطة تتحدث تلقائيًا من الإنتاجية</small>
          </div>
        </div>
        <div className="progress-table-toolbar__actions">
          <div className="input-with-icon progress-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في المشروع، الموقع، الملاحظات..." /></div>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">كل مصادر التنفيذ</option>
            <option value="linked">مرتبط بالإنتاجية</option>
            <option value="manual">يدوي</option>
          </select>
          <ExportButtons
            filename={category ? `project-progress-${category === '__unclassified__' ? 'unclassified' : category}` : 'project-progress'}
            excelSheets={excelSheets}
            compact
            showSuccess
          />
          {permissions.canManageProjectProgress ? <Link className="btn btn-primary" to="/project-progress/new"><Plus size={16} /> تسجيل متابعة</Link> : null}
        </div>
      </section>

      <section className="progress-category-filter" aria-label="فلترة المشاريع حسب الحالة">
        <button type="button" className={!category ? 'is-active' : ''} onClick={() => setCategory('')} aria-pressed={!category}>
          <span>كل المشاريع</span><b>{rows.length}</b>
        </button>
        {PROJECT_PROGRESS_CATEGORIES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={category === item.value ? `is-active status-${item.value}` : `status-${item.value}`}
            onClick={() => setCategory((current) => current === item.value ? '' : item.value)}
            aria-pressed={category === item.value}
          >
            <span>{item.label}</span><b>{categoryCounts[item.value] || 0}</b>
          </button>
        ))}
        <button
          type="button"
          className={category === '__unclassified__' ? 'is-active status-unclassified' : 'status-unclassified'}
          onClick={() => setCategory((current) => current === '__unclassified__' ? '' : '__unclassified__')}
          aria-pressed={category === '__unclassified__'}
        >
          <span>غير مصنف</span><b>{categoryCounts.__unclassified__ || 0}</b>
        </button>
      </section>

      <section className="progress-live-hint">
        <Database size={17} />
        <span>الكميات المنفذة للمشروع المرتبط = إجمالي أمتار إنتاجية نفس المشروع عبر كل الدورات + الكمية التاريخية قبل النظام، بدون تكرار في الحساب.</span>
      </section>

      <section className="progress-table-panel">
        <div className="progress-table-scroll">
          <table className="project-progress-table">
            <thead>
              <tr>
                <th colSpan="3" className="progress-group-head">اخر تاريخ مراجعة</th>
                <th rowSpan="2">رقم</th>
                <th rowSpan="2">المشروع</th>
                <th rowSpan="2">الموقع</th>
                <th colSpan="3" className="progress-group-head">موقف تنفيذي</th>
                <th rowSpan="2">موقف المالي</th>
                <th rowSpan="2">نوع التعاقد</th>
                <th rowSpan="2">الطاقم المسئول عن استكمال الاعمال</th>
                <th rowSpan="2">ملاحظات</th>
                <th rowSpan="2" className="progress-status-head">حالة المشروع</th>
                {(permissions.canManageProjectProgress || permissions.canDeleteProjectProgress) ? <th rowSpan="2" className="progress-actions-head">إجراءات</th> : null}
              </tr>
              <tr>
                <th>م. يحيي حسين</th>
                <th>م. مارينا سامي</th>
                <th>م. عبدالرحمن حسين</th>
                <th>كميات العقد</th>
                <th>الكميات المنفذة</th>
                <th>نسب التنفيذ %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className={row.execution_mode === 'linked' ? 'is-linked' : ''}>
                  <td>{displayDate(row.review_yahya_date)}</td>
                  <td>{displayDate(row.review_marina_date)}</td>
                  <td>{displayDate(row.review_abdelrahman_date)}</td>
                  <td className="progress-number-cell">{row.display_number ?? '—'}</td>
                  <td className="progress-project-cell">
                    <strong title={row.project || ''}>{row.project || '—'}</strong>
                    {row.source === 'excel_import' ? <small><FileSpreadsheet size={12} /> Excel</small> : null}
                  </td>
                  <td>{row.location || '—'}</td>
                  <td className="progress-metric-cell">{displayNumber(row.contract_quantity)}</td>
                  <td className="progress-metric-cell">
                    <strong>{displayNumber(row.executed_quantity)}</strong>
                    <small className={row.execution_mode === 'linked' ? 'linked' : 'manual'}>
                      {row.execution_mode === 'linked' ? 'تلقائي' : 'يدوي'}
                    </small>
                  </td>
                  <td className={Number(row.execution_percent || 0) > 100 ? 'progress-percent over' : 'progress-percent'}>
                    {row.execution_percent == null ? '—' : `${displayNumber(row.execution_percent)}%`}
                  </td>
                  <td className="progress-long-cell">{row.financial_status || '—'}</td>
                  <td className="progress-long-cell">{row.contract_type || '—'}</td>
                  <td className="progress-long-cell">{row.responsible_team || '—'}</td>
                  <td className="progress-notes-cell">{row.notes || '—'}</td>
                  <td className="progress-status-cell">
                    <span className={`progress-status-badge status-${row.project_category || 'unclassified'}`}>
                      {projectCategoryLabel(row.project_category, { short: true })}
                    </span>
                  </td>
                  {(permissions.canManageProjectProgress || permissions.canDeleteProjectProgress) ? (
                    <td className="progress-row-actions">
                      <div className="progress-row-action-buttons">
                        {permissions.canManageProjectProgress ? (
                          <button
                            className="progress-edit-btn"
                            type="button"
                            onClick={() => openEdit(row)}
                            aria-label={`تعديل متابعة ${row.project || 'المشروع'}`}
                          >
                            <Pencil size={15} />
                            <span>تعديل</span>
                          </button>
                        ) : null}
                        {permissions.canDeleteProjectProgress ? (
                          <button
                            className="progress-delete-btn"
                            type="button"
                            onClick={() => remove(row)}
                            disabled={deleteMutation.isPending && deleteMutation.variables === row.id}
                            aria-label={`حذف متابعة ${row.project || 'المشروع'}`}
                          >
                            <Trash2 size={15} />
                            <span>{deleteMutation.isPending && deleteMutation.variables === row.id ? '...' : 'حذف'}</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <EmptyState title="مفيش نتائج مطابقة" description="غيّر البحث أو الفلتر لعرض بيانات المتابعة." /> : null}
      </section>

      <Modal open={Boolean(editing)} title={editing ? `تعديل متابعة — ${editing.project || 'مشروع'}` : 'تعديل المتابعة'} onClose={() => setEditing(null)} width="xl">
        {editing ? (
          <ProjectProgressForm
            references={refsQuery.data}
            projectMetersMap={projectMetersMap}
            initial={editing}
            submitting={mutation.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(payload) => mutation.mutateAsync(payload)}
          />
        ) : null}
      </Modal>
    </div>
  )
}
