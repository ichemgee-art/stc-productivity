import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, ExternalLink, FileSpreadsheet, Maximize2, Minimize2, Paperclip, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react'
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

const PROJECT_PROGRESS_PIN_COLUMNS = [
  { key: 'number', label: 'رقم' },
  { key: 'project', label: 'المشروع' },
  { key: 'location', label: 'الموقع' },
  { key: 'originalContract', label: 'كمية التعاقد الأصلية' },
  { key: 'contractValue', label: 'قيمة العقد' },
  { key: 'financial', label: 'الموقف المالي' },
  { key: 'contract', label: 'نوع التعاقد' },
  { key: 'team', label: 'الطاقم المسئول' },
  { key: 'notes', label: 'ملاحظات' },
  { key: 'status', label: 'حالة المشروع' },
]

const progressPinClass = (active, key, base = '') => [
  base,
  active === key ? 'progress-pinned-column' : '',
].filter(Boolean).join(' ')

export default function ProjectProgressPage() {
  const { permissions } = useAuth()
  const feedback = useFeedback()
  const queryClient = useQueryClient()
  const [search, setSearch] = useSessionState('page:project-progress:search', '')
  const [source, setSource] = useSessionState('page:project-progress:source', '')
  const [category, setCategory] = useSessionState('page:project-progress:category', '')
  const [pinnedColumn, setPinnedColumn] = useSessionState('page:project-progress:pinned-column', '')
  const [editing, setEditing] = useState(null)
  const [tableExpanded, setTableExpanded] = useState(false)
  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState(null)
  const highlightTimerRef = useRef(null)

  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
  }, [])

  useEffect(() => {
    if (!tableExpanded) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setTableExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [tableExpanded])

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
      row.original_contract_quantity,
      row.contract_value,
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
      'كميات التعاقد + البنود المحملة على القطاعات': row.contract_quantity == null ? '' : Number(row.contract_quantity),
      'الكميات المنفذة': row.executed_quantity == null ? '' : Number(row.executed_quantity),
      'نسبة التنفيذ %': row.execution_percent == null ? '' : Number(row.execution_percent),
      'كمية التعاقد الأصلية': row.original_contract_quantity == null ? '' : Number(row.original_contract_quantity),
      'قيمة العقد (ج.م)': row.contract_value == null ? '' : Number(row.contract_value),
      'الموقف المالي': row.financial_status || '',
      'نوع التعاقد': row.contract_type || '',
      'الطاقم المسئول': row.responsible_team || '',
      'ملاحظات': row.notes || '',
      'المرفقات': Number(row.attachment_count || 0),
    })),
  }], [filtered])

  const mutation = useMutation({
    mutationFn: async ({ payload, newFiles, removeAttachmentIds }) => {
      const saved = await appService.saveProjectProgress(payload)
      try {
        await appService.syncProjectProgressAttachments(saved.id, { newFiles, removeAttachmentIds })
      } catch (error) {
        error.projectProgressSaved = saved
        throw error
      }
      return saved
    },
    onSuccess: async (data, variables) => {
      const updatedId = data?.id || variables?.id || null
      setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['project-progress'] })
      if (updatedId) {
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
        setRecentlyUpdatedId(updatedId)
        highlightTimerRef.current = window.setTimeout(() => setRecentlyUpdatedId(null), 1800)
      }
      feedback.success(
        'تم حفظ التعديل',
        `تم تحديث متابعة ${variables.payload?.project_name || 'المشروع'} والحسابات والمرفقات اتحدثت بنجاح.`,
      )
    },
    onError: async (error) => {
      if (error.projectProgressSaved) {
        setEditing((current) => current
          ? { ...current, updated_at: error.projectProgressSaved.updated_at || current.updated_at }
          : current)
        await queryClient.invalidateQueries({ queryKey: ['project-progress'] })
        feedback.error(
          'تم حفظ البيانات وتعذر رفع المرفق',
          error.message || 'بيانات المشروع محفوظة، لكن المرفق لم يكتمل. جرّب رفع الملف مرة أخرى.',
        )
        return
      }
      feedback.error('تعذر حفظ التعديل', error.message || 'حدث خطأ غير متوقع')
    },
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
    setTableExpanded(false)
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
      <div className={tableExpanded ? 'progress-table-workspace is-expanded' : 'progress-table-workspace'}>
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
          <label className="progress-pin-control" title="ثبّت عمود أثناء السكرول العرضي">
            <Pin size={15} />
            <select value={pinnedColumn} onChange={(e) => setPinnedColumn(e.target.value)} aria-label="تثبيت عمود في متابعة المشاريع">
              <option value="">بدون تثبيت</option>
              {PROJECT_PROGRESS_PIN_COLUMNS.map((item) => (
                <option key={item.key} value={item.key}>تثبيت: {item.label}</option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-secondary progress-table-expand-btn"
            type="button"
            onClick={() => setTableExpanded((current) => !current)}
            aria-pressed={tableExpanded}
            title={tableExpanded ? 'الرجوع للعرض العادي (Esc)' : 'عرض الجدول على الشاشة بالكامل'}
          >
            {tableExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {tableExpanded ? 'إغلاق العرض' : 'عرض الجدول'}
          </button>
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

      <section className={`progress-table-panel ${!filtered.length ? 'is-empty' : ''}`}>
        {filtered.length ? <div className="progress-table-scroll">
          <table className="project-progress-table">
            <thead>
              <tr>
                <th colSpan="3" className="progress-group-head">اخر تاريخ مراجعة</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'number')}>رقم</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'project')}>المشروع</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'location')}>الموقع</th>
                <th colSpan="3" className="progress-group-head">موقف تنفيذي</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'originalContract')}>كمية التعاقد الأصلية</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'contractValue')}>قيمة العقد</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'financial')}>موقف المالي</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'contract')}>نوع التعاقد</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'team')}>الطاقم المسئول عن استكمال الاعمال</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'notes')}>ملاحظات</th>
                <th rowSpan="2" className={progressPinClass(pinnedColumn, 'status', 'progress-status-head')}>حالة المشروع</th>
                <th rowSpan="2" className="progress-attachments-head">المرفقات</th>
                {(permissions.canManageProjectProgress || permissions.canDeleteProjectProgress) ? <th rowSpan="2" className="progress-actions-head">إجراءات</th> : null}
              </tr>
              <tr>
                <th>م. يحيي حسين</th>
                <th>م. مارينا سامي</th>
                <th>م. عبدالرحمن حسين</th>
                <th>كميات التعاقد + البنود المحملة على القطاعات</th>
                <th>الكميات المنفذة</th>
                <th>نسب التنفيذ %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={[
                    row.execution_mode === 'linked' ? 'is-linked' : '',
                    row.id === recentlyUpdatedId ? 'is-just-updated' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <td>{displayDate(row.review_yahya_date)}</td>
                  <td>{displayDate(row.review_marina_date)}</td>
                  <td>{displayDate(row.review_abdelrahman_date)}</td>
                  <td className={progressPinClass(pinnedColumn, 'number', 'progress-number-cell')}>{row.display_number ?? '—'}</td>
                  <td className={progressPinClass(pinnedColumn, 'project', 'progress-project-cell')}>
                    <Link className="progress-project-link" to={`/project-progress/${row.id}`} title={row.project || ''}>
                      <strong>{row.project || '—'}</strong>
                      <ExternalLink size={13} />
                    </Link>
                    {row.source === 'excel_import' ? <small><FileSpreadsheet size={12} /> Excel</small> : null}
                  </td>
                  <td className={progressPinClass(pinnedColumn, 'location')}>{row.location || '—'}</td>
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
                  <td className={progressPinClass(pinnedColumn, 'originalContract', 'progress-metric-cell')}>{displayNumber(row.original_contract_quantity)}</td>
                  <td className={progressPinClass(pinnedColumn, 'contractValue', 'progress-money-cell')}>{row.contract_value == null ? '—' : `${displayNumber(row.contract_value)} ج.م`}</td>
                  <td className={progressPinClass(pinnedColumn, 'financial', 'progress-long-cell')}>{row.financial_status || '—'}</td>
                  <td className={progressPinClass(pinnedColumn, 'contract', 'progress-long-cell')}>{row.contract_type || '—'}</td>
                  <td className={progressPinClass(pinnedColumn, 'team', 'progress-long-cell')}>{row.responsible_team || '—'}</td>
                  <td className={progressPinClass(pinnedColumn, 'notes', 'progress-notes-cell')}>{row.notes || '—'}</td>
                  <td className={progressPinClass(pinnedColumn, 'status', 'progress-status-cell')}>
                    <span className={`progress-status-badge status-${row.project_category || 'unclassified'}`}>
                      {projectCategoryLabel(row.project_category, { short: true })}
                    </span>
                  </td>
                  <td className="progress-attachments-cell">
                    {Number(row.attachment_count || 0) > 0 ? (
                      <Link to={`/project-progress/${row.id}#attachments`} className="progress-attachment-count">
                        <Paperclip size={14} /><span>{Number(row.attachment_count)} مرفق</span>
                      </Link>
                    ) : <span className="progress-no-attachments">—</span>}
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
        </div> : (
          <div className="progress-empty-state">
            <EmptyState
              title={rows.length ? 'مفيش مشاريع مطابقة' : 'مفيش مشاريع مسجلة'}
              description={rows.length
                ? 'مفيش مشاريع مطابقة للبحث أو الفلتر الحالي. غيّر الفلتر أو اضغط نفس الكاتيجوري مرة تانية لإلغائها.'
                : 'لما تسجل أول متابعة مشروع هتظهر هنا تلقائيًا.'}
            />
          </div>
        )}
      </section>
      </div>

      <Modal open={Boolean(editing)} title={editing ? `تعديل متابعة — ${editing.project || 'مشروع'}` : 'تعديل المتابعة'} onClose={() => setEditing(null)} width="xl">
        {editing ? (
          <ProjectProgressForm
            references={refsQuery.data}
            projectMetersMap={projectMetersMap}
            initial={editing}
            submitting={mutation.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(submission) => mutation.mutateAsync(submission)}
          />
        ) : null}
      </Modal>
    </div>
  )
}
