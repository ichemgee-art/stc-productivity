import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFeedback } from '../context/FeedbackContext'
import { appService } from '../services/appService'
import { useSessionState } from '../lib/sessionCache'
import { date, number } from '../lib/format'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import ExportButtons from '../components/ExportButtons'
import { smartIncludes } from '../lib/smartSearch'

export default function ProjectsPage() {
  const { permissions } = useAuth()
  const queryClient = useQueryClient()
  const feedback = useFeedback()
  const [queryText, setQueryText] = useSessionState('page:projects:query', '')
  const [activeFilter, setActiveFilter] = useSessionState('page:projects:active-filter', '')
  const [editing, setEditing] = useState(null)
  const exportRef = useRef(null)

  const query = useQuery({ queryKey: ['projects'], queryFn: appService.projects })

  const refreshProjects = async () => {
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
    await queryClient.invalidateQueries({ queryKey: ['references'] })
    await queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
  }

  const mutation = useMutation({
    mutationFn: appService.saveProject,
    onSuccess: async (_data, variables) => {
      setEditing(null)
      await refreshProjects()
      feedback.success(variables.id ? 'تم تحديث المشروع' : 'تم إضافة المشروع', 'تم حفظ بيانات المشروع بنجاح.')
    },
    onError: (err) => feedback.error('تعذر حفظ المشروع', err.message || 'حدث خطأ غير متوقع'),
  })

  const deleteMutation = useMutation({
    mutationFn: appService.deleteProject,
    onError: (err) => feedback.error('تعذر حذف المشروع', err.message || 'حدث خطأ غير متوقع'),
  })

  const removeProject = async (project) => {
    const accepted = await feedback.confirm({
      title: 'حذف المشروع؟',
      message: 'سيتم الحذف نهائيًا فقط إذا لم يكن المشروع مستخدمًا في أي عملية تاريخية.',
      details: `${project.name} · مرات الاستخدام ${number(project.use_count || 0)}`,
      confirmLabel: 'فحص وحذف',
      cancelLabel: 'رجوع',
      tone: 'danger',
    })
    if (!accepted) return

    const result = await deleteMutation.mutateAsync(project.id)
    if (result?.blocked) {
      const linked = Number(result.submission_links || 0)
      const disable = await feedback.confirm({
        title: 'لا يمكن حذف المشروع بسبب التاريخ',
        message: 'المشروع مستخدم في عمليات قديمة ويجب الحفاظ عليه للتقارير التاريخية. يمكنك تعطيله حتى لا يظهر في الإدخالات الجديدة.',
        details: `مرتبط بـ ${linked} عملية تاريخية`,
        confirmLabel: project.active ? 'تعطيل المشروع' : 'إغلاق',
        cancelLabel: 'رجوع',
        tone: project.active ? 'primary' : 'danger',
      })
      if (disable && project.active) {
        await mutation.mutateAsync({ id: project.id, name: project.name, active: false })
      }
      return
    }

    await refreshProjects()
    feedback.deleted('تم حذف المشروع', `تم حذف ${project.name} نهائيًا لأنه غير مرتبط بعمليات تاريخية.`)
  }

  const rows = useMemo(() => (query.data || []).filter((item) => {
    if (activeFilter === 'active' && !item.active) return false
    if (activeFilter === 'inactive' && item.active) return false
    if (!smartIncludes(queryText, item.name, item.use_count, item.last_used)) return false
    return true
  }), [query.data, activeFilter, queryText])

  const excelSheets = [{
    name: 'المشاريع',
    rows: rows.map((row) => ({
      'المشروع': row.name,
      'الحالة': row.active ? 'نشط' : 'معطل',
      'مرات الاستخدام': Number(row.use_count || 0),
      'آخر استخدام': date(row.last_used),
    })),
  }]

  if (query.isLoading) return <div className="page-loader">جاري تحميل المشاريع...</div>
  if (query.isError) return <div className="page-error">{query.error?.message || 'تعذر تحميل المشاريع'}</div>

  return (
    <div className="page-stack">
      <section className="panel" ref={exportRef}>
        <div className="filters-bar"><div className="input-with-icon grow"><Search size={16} /><input placeholder="بحث باسم المشروع..." value={queryText} onChange={(e) => setQueryText(e.target.value)} /></div><select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">معطل</option></select><ExportButtons filename="projects-filtered" excelSheets={excelSheets} pdfTarget={exportRef} compact />{permissions.canManageProjects ? <button className="btn btn-primary" onClick={() => setEditing({ id: null, name: '', active: true })}><Plus size={16} /> إضافة مشروع</button> : null}</div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>المشروع</th><th>الحالة</th><th>مرات الاستخدام</th><th>آخر استخدام</th>{permissions.canManageProjects ? <th>إدارة</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="strong-cell"><Link className="project-360-row-link" to={`/projects/${row.id}`}><span>{row.name}</span><ExternalLink size={14} /></Link></td><td><span className={`status-pill ${row.active ? 'success' : 'neutral'}`}>{row.active ? 'نشط' : 'معطل'}</span></td><td>{number(row.use_count)}</td><td>{date(row.last_used)}</td>{permissions.canManageProjects ? <td><div className="row-actions project-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(row)}><Pencil size={15} /> تعديل</button><button className="btn btn-danger-soft btn-sm" type="button" disabled={deleteMutation.isPending} onClick={() => removeProject(row)}><Trash2 size={15} /> حذف</button></div></td> : null}</tr>)}</tbody></table>{!rows.length ? (
    <EmptyState
      title={(query.data || []).length ? 'مفيش مشاريع مطابقة للفلاتر' : 'لسه مفيش مشاريع'}
      description={(query.data || []).length ? 'امسح البحث أو غيّر حالة المشروع.' : 'أضف أول مشروع عشان يظهر في الإدخال والتقارير.'}
      actionLabel={(query.data || []).length ? 'مسح الفلاتر' : permissions.canManageProjects ? 'إضافة أول مشروع' : ''}
      onAction={(query.data || []).length ? () => { setQueryText(''); setActiveFilter('') } : permissions.canManageProjects ? () => setEditing({ id: null, name: '', active: true }) : undefined}
      hint="المشاريع النشطة بتظهر تلقائيًا في شاشة إدخال الإنتاجية."
    />
  ) : null}</div>
      </section>
      <Modal open={Boolean(editing)} title={editing?.id ? 'تعديل المشروع' : 'إضافة مشروع'} onClose={() => setEditing(null)}>
        {editing ? <ProjectForm project={editing} saving={mutation.isPending} onSave={(payload) => mutation.mutateAsync(payload)} /> : null}
      </Modal>
    </div>
  )
}

function ProjectForm({ project, saving, onSave }) {
  const [name, setName] = useState(project.name || '')
  const [active, setActive] = useState(project.active !== false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const cleanName = name.trim()
    if (!cleanName) return setError('اسم المشروع مطلوب')
    if (cleanName.length > 200) return setError('اسم المشروع طويل جدًا')
    try { await onSave({ id: project.id || null, name: cleanName, active }) } catch (err) { setError(err.message || 'تعذر الحفظ') }
  }
  return <form className="modal-form" onSubmit={submit} noValidate><label className="field"><span>اسم المشروع</span><input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="toggle-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>المشروع نشط</span></label>{error ? <div className="form-error">{error}</div> : null}<button className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></form>
}
