import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCycle } from '../context/CycleContext'
import { appService } from '../services/appService'
import { money, number } from '../lib/format'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import ExportButtons from '../components/ExportButtons'
import { useFeedback } from '../context/FeedbackContext'
import { smartIncludes } from '../lib/smartSearch'

export default function SectionsPage() {
  const { permissions } = useAuth()
  const { monthKey } = useCycle()
  const queryClient = useQueryClient()
  const feedback = useFeedback()
  const [queryText, setQueryText] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const exportRef = useRef(null)

  const sectionsQuery = useQuery({ queryKey: ['sections'], queryFn: appService.sections })
  const dashboardQuery = useQuery({ queryKey: ['cycle-data', 'dashboard', monthKey], queryFn: () => appService.dashboard(monthKey), enabled: Boolean(monthKey) })
  const refreshSections = async () => {
    await queryClient.invalidateQueries({ queryKey: ['sections'] })
    await queryClient.invalidateQueries({ queryKey: ['references'] })
    await queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
  }

  const mutation = useMutation({
    mutationFn: appService.saveSection,
    onSuccess: async (_data, variables) => {
      setEditing(null)
      await refreshSections()
      feedback.success(variables.id ? 'تم تحديث القطاع' : 'تم إضافة القطاع', 'تم حفظ بيانات القطاع بنجاح.')
    },
    onError: (err) => feedback.error('تعذر حفظ القطاع', err.message || 'حدث خطأ غير متوقع'),
  })

  const deleteMutation = useMutation({
    mutationFn: appService.deleteSection,
    onError: (err) => feedback.error('تعذر حذف القطاع', err.message || 'حدث خطأ غير متوقع'),
  })

  const removeSection = async (section) => {
    const accepted = await feedback.confirm({
      title: 'حذف القطاع؟',
      message: 'سيتم الحذف فقط إذا لم يكن القطاع مستخدمًا في أي عملية تاريخية.',
      details: `${section.name} · سعر المتر الحالي ${money(section.price_per_meter)}`,
      confirmLabel: 'فحص وحذف',
      cancelLabel: 'رجوع',
      tone: 'danger',
    })
    if (!accepted) return

    const result = await deleteMutation.mutateAsync(section.id)
    if (result?.blocked) {
      const linked = Number(result.submission_links || 0)
      const disable = await feedback.confirm({
        title: 'لا يمكن حذف القطاع بسبب التاريخ',
        message: 'القطاع مستخدم في عمليات قديمة ويجب الحفاظ عليه للتقارير التاريخية. يمكنك تعطيله حتى لا يظهر في الإدخالات الجديدة.',
        details: `مرتبط بـ ${linked} عملية تاريخية`,
        confirmLabel: section.active ? 'تعطيل القطاع' : 'إغلاق',
        cancelLabel: 'رجوع',
        tone: section.active ? 'primary' : 'danger',
      })
      if (disable && section.active) {
        await mutation.mutateAsync({ id: section.id, name: section.name, price: section.price_per_meter, active: false })
      }
      return
    }

    await refreshSections()
    feedback.deleted('تم حذف القطاع', `تم حذف ${section.name} نهائيًا لأنه غير مرتبط بعمليات تاريخية.`)
  }

  const statMap = useMemo(() => new Map((dashboardQuery.data?.sections || []).map((item) => [item.name, item])), [dashboardQuery.data])
  const rows = useMemo(() => (sectionsQuery.data || []).filter((item) => {
    if (activeFilter === 'active' && !item.active) return false
    if (activeFilter === 'inactive' && item.active) return false
    if (!smartIncludes(queryText, item.name, item.price_per_meter)) return false
    return true
  }), [sectionsQuery.data, activeFilter, queryText])

  const excelSheets = [{
    name: 'القطاعات',
    rows: rows.map((row) => {
      const stats = statMap.get(row.name) || {}
      return {
        'القطاع': row.name,
        'سعر المتر الحالي': Number(row.price_per_meter || 0),
        'الحالة': row.active ? 'نشط' : 'معطل',
        'مهام الدورة': Number(stats.tasks || 0),
        'أمتار الدورة': Number(stats.meters || 0),
        'إيراد الدورة': Number(stats.revenue || 0),
      }
    }),
  }]

  if (sectionsQuery.isLoading || dashboardQuery.isLoading) return <div className="page-loader">جاري تحميل القطاعات...</div>
  if (sectionsQuery.isError || dashboardQuery.isError) return <div className="page-error">{sectionsQuery.error?.message || dashboardQuery.error?.message || 'تعذر تحميل بيانات القطاعات'}</div>

  return (
    <div className="page-stack">
      <section className="management-hero">
        <div>
          <span className="eyebrow">SECTION MANAGEMENT</span>
          <h2>إدارة القطاعات والأسعار</h2>
          <p>أضف قطاع جديد، عدّل الاسم أو سعر المتر، عطّل القطاع أو احذفه بأمان من نفس الشاشة.</p>
        </div>
        {permissions.canManageSections ? <button className="btn btn-primary management-add-btn" onClick={() => setEditing({ id: null, name: '', price_per_meter: 0, active: true })}><Plus size={18} /> إضافة قطاع جديد</button> : null}
      </section>
      <section className="panel" ref={exportRef}>
        <div className="filters-bar"><div className="input-with-icon grow"><Search size={16} /><input placeholder="بحث باسم القطاع..." value={queryText} onChange={(e) => setQueryText(e.target.value)} /></div><select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">معطل</option></select><ExportButtons filename={`sections-${monthKey}`} excelSheets={excelSheets} pdfTarget={exportRef} compact /></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>القطاع</th><th>سعر المتر الحالي</th><th>الحالة</th><th>مهام الدورة</th><th>أمتار الدورة</th><th>إيراد الدورة</th>{permissions.canManageSections ? <th>إدارة</th> : null}</tr></thead><tbody>{rows.map((row) => { const stats = statMap.get(row.name) || {}; return <tr key={row.id}><td className="strong-cell">{row.name}</td><td>{money(row.price_per_meter)}</td><td><span className={`status-pill ${row.active ? 'success' : 'neutral'}`}>{row.active ? 'نشط' : 'معطل'}</span></td><td>{number(stats.tasks)}</td><td>{number(stats.meters)}</td><td>{money(stats.revenue)}</td>{permissions.canManageSections ? <td><div className="row-actions section-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(row)}><Pencil size={15} /> تعديل</button><button className="btn btn-danger-soft btn-sm" type="button" onClick={() => removeSection(row)}><Trash2 size={15} /> حذف</button></div></td> : null}</tr> })}</tbody></table>{!rows.length ? (
    <EmptyState
      title={(sectionsQuery.data || []).length ? 'مفيش قطاعات مطابقة للفلاتر' : 'لسه مفيش قطاعات'}
      description={(sectionsQuery.data || []).length ? 'امسح البحث أو غيّر حالة القطاع.' : 'أضف أول قطاع وحدد سعر المتر ليظهر في الإدخال.'}
      actionLabel={(sectionsQuery.data || []).length ? 'مسح الفلاتر' : permissions.canManageSections ? 'إضافة أول قطاع' : ''}
      onAction={(sectionsQuery.data || []).length ? () => { setQueryText(''); setActiveFilter('') } : permissions.canManageSections ? () => setEditing({ id: null, name: '', price_per_meter: 0, active: true }) : undefined}
      hint="السعر الحالي يُستخدم للعمليات الجديدة، والتاريخ القديم يفضل محفوظ بسعره."
    />
  ) : null}</div>
      </section>
      <Modal open={Boolean(editing)} title={editing?.id ? 'تعديل القطاع' : 'إضافة قطاع'} onClose={() => setEditing(null)}>
        {editing ? <SectionForm section={editing} saving={mutation.isPending} onSave={(payload) => mutation.mutateAsync(payload)} /> : null}
      </Modal>
    </div>
  )
}

function SectionForm({ section, saving, onSave }) {
  const [name, setName] = useState(section.name || '')
  const [price, setPrice] = useState(section.price_per_meter ?? 0)
  const [active, setActive] = useState(section.active !== false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const cleanName = name.trim()
    const numericPrice = Number(price)
    if (!cleanName) return setError('اسم القطاع مطلوب')
    if (cleanName.length > 120) return setError('اسم القطاع طويل جدًا')
    if (String(price).trim() === '' || !Number.isFinite(numericPrice) || numericPrice < 0) return setError('اكتب سعر المتر بشكل صحيح')
    try { await onSave({ id: section.id || null, name: cleanName, price: numericPrice, active }) } catch (err) { setError(err.message || 'تعذر الحفظ') }
  }
  return <form className="modal-form" onSubmit={submit} noValidate><label className="field"><span>اسم القطاع</span><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>سعر المتر</span><input type="number" min="0" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} /></label><label className="toggle-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>القطاع نشط</span></label><div className="form-hint">تغيير السعر يؤثر على العمليات الجديدة فقط؛ السجلات القديمة تحتفظ بسعرها التاريخي.</div>{error ? <div className="form-error">{error}</div> : null}<button className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></form>
}
