import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Building2, Calculator, Check, CheckCircle2, Clock, Database, FileImage, FileSpreadsheet, FileText, Layers, Link2, Paperclip, PenLine, Save, Trash2, UploadCloud, X } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { PROJECT_PROGRESS_CATEGORIES, progressRequest } from '../lib/projectProgress'
import { clearSessionCache, useSessionState } from '../lib/sessionCache'
import { appService } from '../services/appService'

const categoryIcons = {
  completed_handed_over: CheckCircle2,
  nearing_completion: Clock,
  phased_client_request: Layers,
  active: Activity,
}

const emptyForm = {
  report_date: '',
  review_yahya_date: '',
  review_marina_date: '',
  review_abdelrahman_date: '',
  project_id: '',
  project_name: '',
  location: '',
  project_category: '',
  contract_quantity: '',
  original_contract_quantity: '',
  contract_value: '',
  historical_before_system: '',
  manual_executed_quantity: '',
  financial_status: '',
  contract_type: '',
  responsible_team: '',
  notes: '',
}

const toInput = (value) => value == null ? '' : String(value)

const MAX_ATTACHMENTS = 3
const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const attachmentKind = (mimeType) => mimeType === 'application/pdf'
  ? 'PDF'
  : mimeType?.startsWith('image/')
    ? 'صورة'
    : 'Word'

const fileSize = (bytes) => {
  const value = Number(bytes || 0)
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024)).toLocaleString('en-US')} KB`
  return `${(value / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 1 })} MB`
}

export default function ProjectProgressForm({
  references,
  projectMetersMap,
  initial,
  onSubmit,
  submitting,
  onCancel,
}) {
  const { permissions } = useAuth()
  const requestRef = useRef(null)
  const busyRef = useRef(false)
  const draftEnabled = !initial
  const [saveAlias, setSaveAlias] = useSessionState('draft:project-progress:save-alias', false, { enabled: draftEnabled })
  const [saved, setSaved] = useState(false)
  const originalName = initial?.original_project_name || initial?.project_name_snapshot || initial?.project || ''
  const businessToday = references?.businessToday || ''
  const initialLinked = Boolean(initial?.project_id)
  const [projectMode, setProjectMode] = useSessionState(
    'draft:project-progress:mode',
    initial ? (initialLinked ? 'linked' : 'manual') : 'linked',
    { enabled: draftEnabled },
  )
  const [form, setForm] = useSessionState('draft:project-progress:form', () => ({
    ...emptyForm,
    report_date: initial?.report_date || businessToday,
    review_yahya_date: initial?.review_yahya_date || '',
    review_marina_date: initial?.review_marina_date || '',
    review_abdelrahman_date: initial?.review_abdelrahman_date || '',
    project_id: initial?.project_id || '',
    project_name: initial?.project || initial?.project_name_snapshot || '',
    location: initial?.location || '',
    project_category: initial?.project_category || '',
    contract_quantity: toInput(initial?.contract_quantity),
    original_contract_quantity: toInput(initial?.original_contract_quantity),
    contract_value: toInput(initial?.contract_value),
    historical_before_system: toInput(initial?.historical_before_system),
    manual_executed_quantity: toInput(initial?.manual_executed_quantity ?? initial?.executed_quantity),
    financial_status: initial?.financial_status || '',
    contract_type: initial?.contract_type || '',
    responsible_team: initial?.responsible_team || '',
    notes: initial?.notes || '',
  }), { enabled: draftEnabled })
  const [error, setError] = useState('')
  const [existingAttachments, setExistingAttachments] = useState([])
  const [newFiles, setNewFiles] = useState([])
  const [removeAttachmentIds, setRemoveAttachmentIds] = useState([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (!initial?.id) {
      setExistingAttachments([])
      setRemoveAttachmentIds([])
      return () => { active = false }
    }

    setAttachmentsLoading(true)
    appService.projectProgressAttachments(initial.id)
      .then((rows) => {
        if (active) setExistingAttachments(rows || [])
      })
      .catch((err) => {
        if (active) setError(err.message || 'تعذر تحميل مرفقات المشروع')
      })
      .finally(() => {
        if (active) setAttachmentsLoading(false)
      })

    return () => { active = false }
  }, [initial?.id])

  const projects = useMemo(
    () => (references?.projects || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [references?.projects],
  )

  const selectedProject = projects.find((project) => project.id === form.project_id)
  const productivityMeters = projectMode === 'linked' && form.project_id
    ? Number(projectMetersMap?.[form.project_id] || 0)
    : 0
  const beforeSystem = Number(form.historical_before_system || 0)
  const manualExecuted = Number(form.manual_executed_quantity || 0)
  const contractQuantity = Number(form.contract_quantity || 0)
  const executedQuantity = projectMode === 'linked' ? beforeSystem + productivityMeters : manualExecuted
  const executionPercent = contractQuantity > 0 ? (executedQuantity / contractQuantity) * 100 : null
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const visibleExistingAttachments = existingAttachments.filter((row) => !removeAttachmentIds.includes(row.id))
  const attachmentCount = visibleExistingAttachments.length + newFiles.length

  const onFilesSelected = (event) => {
    const incoming = Array.from(event.target.files || [])
    event.target.value = ''
    if (!incoming.length) return

    const invalidType = incoming.find((file) => !ALLOWED_ATTACHMENT_TYPES.has(file.type))
    if (invalidType) return setError(`نوع الملف غير مسموح: ${invalidType.name}. المسموح PDF أو صور أو Word.`)

    const oversized = incoming.find((file) => file.size > MAX_ATTACHMENT_SIZE)
    if (oversized) return setError(`الملف ${oversized.name} أكبر من 15MB`)

    if (attachmentCount + incoming.length > MAX_ATTACHMENTS) {
      return setError('الحد الأقصى 3 مرفقات لكل متابعة مشروع')
    }

    setError('')
    setNewFiles((current) => [...current, ...incoming])
  }

  const markAttachmentForRemoval = (id) => {
    setRemoveAttachmentIds((current) => current.includes(id) ? current : [...current, id])
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submitting || busyRef.current) return
    setError('')

    if (!form.report_date) return setError('اختار تاريخ المتابعة')
    for (const key of ['report_date', 'review_yahya_date', 'review_marina_date', 'review_abdelrahman_date']) {
      if (businessToday && form[key] > businessToday && form[key] !== initial?.[key]) return setError('لا يمكن تسجيل تاريخ متابعة أو مراجعة في المستقبل')
    }
    if (projectMode === 'linked' && !form.project_id) return setError('اختار المشروع من قائمة المشاريع')
    if (projectMode === 'manual' && !form.project_name.trim() && !(initial?.source === 'excel_import' && initial?.legacy_excel_row)) return setError('اكتب اسم المشروع الجديد')
    if (!form.project_category) return setError('اختار حالة المشروع من التصنيفات الأربعة')
    if (form.contract_quantity !== '' && Number(form.contract_quantity) < 0) return setError('كميات التعاقد + البنود المحملة على القطاعات لا يمكن أن تكون سالبة')
    if (form.original_contract_quantity !== '' && Number(form.original_contract_quantity) < 0) return setError('كمية التعاقد الأصلية لا يمكن أن تكون سالبة')
    if (form.contract_value !== '' && Number(form.contract_value) < 0) return setError('قيمة العقد لا يمكن أن تكون سالبة')
    if (projectMode === 'linked' && Number(form.historical_before_system || 0) < 0) return setError('كميات ما قبل النظام لا يمكن أن تكون سالبة')
    if (projectMode === 'manual' && Number(form.manual_executed_quantity || 0) < 0) return setError('الكميات المنفذة لا يمكن أن تكون سالبة')

    const payload = {
      expected_updated_at: initial?.updated_at || null,
      save_alias: saveAlias && permissions.isAdmin && projectMode === 'linked',
      alias_name: originalName || form.project_name.trim(),
      id: initial?.id || null,
      report_date: form.report_date,
      review_yahya_date: form.review_yahya_date || '',
      review_marina_date: form.review_marina_date || '',
      review_abdelrahman_date: form.review_abdelrahman_date || '',
      project_id: projectMode === 'linked' ? form.project_id : '',
      project_name: projectMode === 'manual' ? form.project_name.trim() : initial?.original_project_name || (initial?.source === 'excel_import' ? originalName : '') || selectedProject?.name || '',
      location: form.location.trim(),
      project_category: form.project_category,
      contract_quantity: form.contract_quantity === '' ? null : Number(form.contract_quantity),
      original_contract_quantity: form.original_contract_quantity === '' ? null : Number(form.original_contract_quantity),
      contract_value: form.contract_value === '' ? null : Number(form.contract_value),
      historical_before_system: projectMode === 'linked' ? Number(form.historical_before_system || 0) : 0,
      manual_executed_quantity: projectMode === 'manual' ? Number(form.manual_executed_quantity || 0) : null,
      execution_mode: projectMode,
      financial_status: form.financial_status.trim(),
      contract_type: form.contract_type.trim(),
      responsible_team: form.responsible_team.trim(),
      notes: form.notes.trim(),
    }
    requestRef.current = progressRequest(requestRef.current, payload)
    busyRef.current = true
    try {
      await onSubmit({
        payload: { ...payload, request_id: requestRef.current.id },
        newFiles,
        removeAttachmentIds,
      })
      if (draftEnabled) {
        clearSessionCache('draft:project-progress:save-alias')
        clearSessionCache('draft:project-progress:mode')
        clearSessionCache('draft:project-progress:form')
      }
      setSaved(true)
    } catch (err) {
      setError(err.message || 'تعذر حفظ المتابعة')
    } finally {
      busyRef.current = false
    }
  }

  return (
    <form className="progress-entry-form" onSubmit={submit} aria-busy={submitting}>
      <div className="progress-form-guide" aria-label="خطوات تسجيل متابعة المشروع">
        <div><span>1</span><strong>اختار المشروع</strong><small>حدد التاريخ والمشروع أو أضف مشروع يدوي.</small></div>
        <div><span>2</span><strong>سجل الكميات</strong><small>أدخل كمية العقد وما قبل النظام عند الحاجة.</small></div>
        <div><span>3</span><strong>أكمل واحفظ</strong><small>أضف المراجعات والموقف المالي والملاحظات.</small></div>
      </div>

      {error ? <div className="inline-error progress-form-error" role="alert">{error}</div> : null}
      {!initial && saved ? (
        <div className="progress-save-success" role="status">
          <CheckCircle2 size={18} />
          <div><strong>تم حفظ المتابعة بنجاح</strong><span>المشروع اتسجل وبياناته جاهزة في متابعة المشاريع.</span></div>
        </div>
      ) : null}

      <section className="progress-form-card">
        <div className="progress-form-heading">
          <div>
            <span>01</span>
            <h3>بيانات المتابعة</h3>
          </div>
          <p>اختار التاريخ والمشروع، أو سجل مشروع جديد يدويًا لو مش موجود في النظام.</p>
        </div>

        <div className="progress-form-grid">
          <label className="field">
            <span>تاريخ المتابعة <b className="progress-required">*</b></span>
            <input required type="date" max={businessToday || undefined} value={form.report_date} onChange={(e) => setField('report_date', e.target.value)} />
          </label>

          <div className="progress-mode-field progress-field-wide">
            <div className="progress-field-label">
              <span>مصدر المشروع</span>
              <small>اختار الطريقة اللي هتسجل بيها المشروع. الاختيار ده بيحدد طريقة حساب الكميات المنفذة.</small>
            </div>
            <div className="progress-mode-selector" role="group" aria-label="مصدر المشروع">
              <button
                className={projectMode === 'linked' ? 'is-active' : ''}
                type="button"
                aria-pressed={projectMode === 'linked'}
                onClick={() => setProjectMode('linked')}
              >
                <span className="progress-mode-icon"><Database size={19} /></span>
                <span><strong>مشروع موجود في السيستم</strong><small>الأفضل للمشاريع الحالية — التنفيذ يتحدث تلقائيًا من الإنتاجية.</small></span>
              </button>
              <button
                className={projectMode === 'manual' ? 'is-active' : ''}
                type="button"
                aria-pressed={projectMode === 'manual'}
                onClick={() => {
                  setProjectMode('manual')
                  setField('project_id', '')
                }}
              >
                <span className="progress-mode-icon"><PenLine size={19} /></span>
                <span><strong>مشروع جديد / إدخال يدوي</strong><small>استخدمه لو المشروع مش موجود في قائمة المشاريع الحالية.</small></span>
              </button>
            </div>
          </div>

          {projectMode === 'linked' ? (
            <label className="field progress-field-wide">
              <span>المشروع <b className="progress-required">*</b></span>
              <select required value={form.project_id} onChange={(e) => setField('project_id', e.target.value)}>
                <option value="">اختار المشروع...</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <small className="progress-field-hint">بعد اختيار المشروع، كميات الإنتاجية الخاصة به هتدخل تلقائيًا في الحساب.</small>
            </label>
          ) : (
            <label className="field progress-field-wide">
              <span>اسم المشروع <b className="progress-required">*</b></span>
              <input required={!(initial?.source === 'excel_import' && initial?.legacy_excel_row)} value={form.project_name} onChange={(e) => setField('project_name', e.target.value)} placeholder="اكتب اسم المشروع كما تريد ظهوره في الجدول" maxLength={200} />
            </label>
          )}

          {projectMode === 'linked' && permissions.isAdmin && (originalName || form.project_name.trim()) ? (
            <label className="field progress-field-wide"><span><input type="checkbox" checked={saveAlias} onChange={(e) => setSaveAlias(e.target.checked)} /> ربط هذا الاسم بمشروع موجود وحفظ الربط للمستقبل</span><small>{originalName || form.project_name} — سيظل الاسم الأصلي محفوظًا. لا يتم نقل الكميات اليدوية إلى ما قبل النظام تلقائيًا.</small></label>
          ) : null}

          {projectMode === 'linked' && selectedProject ? (
            <div className="progress-selected-project progress-field-wide">
              <span className="progress-selected-project__icon"><Building2 size={20} /></span>
              <div>
                <small>المشروع المختار</small>
                <strong>{selectedProject.name}</strong>
                <span>إنتاجية مسجلة حاليًا: <b>{productivityMeters.toLocaleString('en-US', { maximumFractionDigits: 2 })} م</b></span>
              </div>
              <em>مرتبط تلقائيًا</em>
            </div>
          ) : null}

          <label className="field progress-field-wide">
            <span>الموقع</span>
            <input value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder="مثال: العاصمة الإدارية، التجمع، العلمين..." maxLength={300} />
            <small className="progress-field-hint">اكتب موقع المشروع بشكل مختصر وواضح عشان البحث في الجدول يبقى أسهل.</small>
          </label>

          <div className="progress-project-category progress-field-wide">
            <div className="progress-field-label">
              <span>حالة المشروع <b className="progress-required">*</b></span>
              <small>اختار التصنيف الحالي للمشروع. تقدر تغيّره بعد كده من زر تعديل.</small>
            </div>
            <div className="progress-category-selector" role="radiogroup" aria-label="حالة المشروع">
              {PROJECT_PROGRESS_CATEGORIES.map((item) => {
                const Icon = categoryIcons[item.value]
                const active = form.project_category === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={active ? `is-active status-${item.value}` : `status-${item.value}`}
                    onClick={() => setField('project_category', active ? '' : item.value)}
                  >
                    <span className="progress-category-selector__icon"><Icon size={19} /></span>
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    {active ? <span className="progress-category-selector__selected" aria-hidden="true"><Check size={14} /></span> : null}
                  </button>
                )
              })}
            </div>
            {initial && !initial.project_category ? <div className="progress-category-legacy-note">المشروع ده قديم ولسه غير مصنف — اختار حالة قبل حفظ التعديل.</div> : null}
          </div>
        </div>
      </section>

      <section className="progress-form-card">
        <div className="progress-form-heading">
          <div>
            <span>02</span>
            <h3>الموقف التنفيذي</h3>
          </div>
          <p>سجل كميات التعاقد والبيانات المرجعية، والسيستم هيحسب المنفذ ونسبة التنفيذ من كميات التعاقد المحملة على القطاعات.</p>
        </div>

        <div className="progress-execution-grid">
          <label className="field">
            <span>كميات التعاقد + البنود المحملة على القطاعات</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={form.contract_quantity} onChange={(e) => setField('contract_quantity', e.target.value)} placeholder="مثال: 1250" />
            <small className="progress-field-hint">دي الكمية الأساسية اللي عليها حساب نسبة التنفيذ — نفس لوجيك كميات العقد السابق.</small>
          </label>

          <label className="field">
            <span>كمية التعاقد الأصلية</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={form.original_contract_quantity} onChange={(e) => setField('original_contract_quantity', e.target.value)} placeholder="مثال: 1000" />
            <small className="progress-field-hint">رقم مرجعي فقط ولا يدخل في أي حسابات.</small>
          </label>

          <label className="field progress-contract-value-field">
            <span>قيمة العقد</span>
            <div className="progress-money-input">
              <input type="number" min="0" step="0.01" inputMode="decimal" value={form.contract_value} onChange={(e) => setField('contract_value', e.target.value)} placeholder="مثال: 1250000" />
              <b>ج.م</b>
            </div>
            <small className="progress-field-hint">قيمة مرجعية للعقد بالجنيه المصري ولا تدخل في حسابات التنفيذ.</small>
          </label>

          {projectMode === 'linked' ? (
            <>
              <div className="progress-readonly-metric">
                <span><Database size={15} /> من الإنتاجية</span>
                <strong>{productivityMeters.toLocaleString('en-US', { maximumFractionDigits: 2 })} م</strong>
                <small>يتحدث تلقائيًا من كل إنتاجية المشروع.</small>
              </div>
              <label className="field">
                <span>منفذ قبل السيستم</span>
                <input type="number" min="0" step="0.01" value={form.historical_before_system} onChange={(e) => setField('historical_before_system', e.target.value)} placeholder="0.00" />
                <small className="progress-field-hint">اكتب فقط الكميات القديمة غير الموجودة في الإنتاجية.</small>
              </label>
            </>
          ) : (
            <label className="field progress-field-wide">
              <span>الكميات المنفذة</span>
              <input type="number" min="0" step="0.01" value={form.manual_executed_quantity} onChange={(e) => setField('manual_executed_quantity', e.target.value)} placeholder="0.00" />
              <small className="progress-field-hint">مشروع غير مربوط بالإنتاجية، لذلك الكمية هنا يدوية.</small>
            </label>
          )}

          <div className="progress-calculated-card">
            <span><Calculator size={16} /> إجمالي الكميات المنفذة</span>
            <strong>{executedQuantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} م</strong>
          </div>
          <div className="progress-calculated-card">
            <span>نسبة التنفيذ</span>
            <strong>{executionPercent == null ? '—' : `${executionPercent.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`}</strong>
          </div>
        </div>
      </section>

      {executionPercent > 100 ? <div role="status" className="progress-import-note">التنفيذ تجاوز كميات التعاقد + البنود المحملة على القطاعات بـ {(executionPercent - 100).toFixed(2)}%</div> : null}

      <section className="progress-form-card">
        <div className="progress-form-heading">
          <div>
            <span>03</span>
            <h3>المراجعات والبيانات الإضافية</h3>
          </div>
          <p>سجل تواريخ المراجعة والموقف المالي والتعاقد والطاقم والملاحظات، وأرفق مستندات المشروع عند الحاجة.</p>
        </div>

        <div className="progress-subsection-title">
          <strong>تواريخ آخر مراجعة</strong>
          <span>سيب أي تاريخ فاضي لو الشخص لسه ما راجعش المشروع.</span>
        </div>

        <div className="progress-review-dates">
          <label className="field"><span>آخر مراجعة — م. يحيي حسين</span><input type="date" value={form.review_yahya_date} onChange={(e) => setField('review_yahya_date', e.target.value)} /></label>
          <label className="field"><span>آخر مراجعة — م. مارينا سامي</span><input type="date" value={form.review_marina_date} onChange={(e) => setField('review_marina_date', e.target.value)} /></label>
          <label className="field"><span>آخر مراجعة — م. عبدالرحمن حسين</span><input type="date" value={form.review_abdelrahman_date} onChange={(e) => setField('review_abdelrahman_date', e.target.value)} /></label>
        </div>

        <div className="progress-subsection-title progress-subsection-title--spaced">
          <strong>بيانات التعاقد والمتابعة</strong>
          <span>الحقول دي نصية ومرنة، وتقدر تجمع فيها عربي وEnglish وأرقام.</span>
        </div>

        <div className="progress-form-grid">
          <label className="field progress-field-wide">
            <span>الموقف المالي</span>
            <textarea rows={3} value={form.financial_status} onChange={(e) => setField('financial_status', e.target.value)} placeholder="مثال: مستخلص 3 — 125,000 EGP — Approved بنسبة 70%" />
            <small className="progress-field-hint">يقبل عربي + English + أرقام + نسب ومبالغ. مثال: تم صرف 85,000 جنيه والمتبقي 40,000 EGP.</small>
          </label>
          <label className="field">
            <span>نوع التعاقد</span>
            <input value={form.contract_type} onChange={(e) => setField('contract_type', e.target.value)} placeholder="مثال: توريد وتركيب / مقاولة / مطالبة" />
            <small className="progress-field-hint">اكتب وصف مختصر لطبيعة التعاقد.</small>
          </label>
          <label className="field">
            <span>الطاقم المسئول عن استكمال الأعمال</span>
            <input value={form.responsible_team} onChange={(e) => setField('responsible_team', e.target.value)} placeholder="مثال: م. أحمد + فريق التركيب" />
            <small className="progress-field-hint">اسم المهندس أو الفريق المسئول حاليًا عن استكمال المشروع.</small>
          </label>
          <label className="field progress-field-wide">
            <span>ملاحظات</span>
            <textarea rows={4} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="مثال: انتظار اعتماد الرسومات — مطلوب زيارة موقع — توريد الخامة خلال الأسبوع..." />
            <small className="progress-field-hint">اكتب أي نقطة محتاج الفريق يفتكرها في المتابعة الجاية.</small>
          </label>
        </div>

        <div className="progress-subsection-title progress-subsection-title--spaced">
          <strong>مرفقات المشروع</strong>
          <span>بحد أقصى 3 ملفات — PDF أو صور أو Word — والـPDF بيتجهز له Preview للصفحة الأولى تلقائيًا.</span>
        </div>

        <div className="progress-attachments-box">
          <label className={attachmentCount >= MAX_ATTACHMENTS ? 'progress-upload-zone is-disabled' : 'progress-upload-zone'}>
            <UploadCloud size={22} />
            <strong>{attachmentCount >= MAX_ATTACHMENTS ? 'وصلت للحد الأقصى' : 'إضافة مرفقات'}</strong>
            <small>{attachmentCount} / {MAX_ATTACHMENTS} · بحد أقصى 15MB للملف</small>
            <input
              type="file"
              multiple
              disabled={attachmentCount >= MAX_ATTACHMENTS}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFilesSelected}
            />
          </label>

          {attachmentsLoading ? <div className="progress-attachments-loading">جاري تحميل المرفقات...</div> : null}

          {(visibleExistingAttachments.length || newFiles.length) ? (
            <div className="progress-attachment-list">
              {visibleExistingAttachments.map((item) => (
                <div className="progress-attachment-item" key={item.id}>
                  <span className="progress-attachment-item__icon">
                    {item.mime_type === 'application/pdf' ? <FileText size={18} /> : item.mime_type?.startsWith('image/') ? <FileImage size={18} /> : <Paperclip size={18} />}
                  </span>
                  <div>
                    <strong>{item.file_name}</strong>
                    <small>{attachmentKind(item.mime_type)} · {fileSize(item.file_size)} · محفوظ</small>
                  </div>
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer">فتح</a> : null}
                  <button type="button" onClick={() => markAttachmentForRemoval(item.id)} aria-label={`حذف ${item.file_name}`}><Trash2 size={15} /></button>
                </div>
              ))}

              {newFiles.map((file, index) => (
                <div className="progress-attachment-item is-new" key={`${file.name}-${file.size}-${index}`}>
                  <span className="progress-attachment-item__icon">
                    {file.type === 'application/pdf' ? <FileText size={18} /> : file.type?.startsWith('image/') ? <FileImage size={18} /> : <Paperclip size={18} />}
                  </span>
                  <div>
                    <strong>{file.name}</strong>
                    <small>{attachmentKind(file.type)} · {fileSize(file.size)} · جاهز للرفع</small>
                  </div>
                  <button type="button" onClick={() => setNewFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`إزالة ${file.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="progress-attachments-empty"><Paperclip size={17} /> لا توجد مرفقات مضافة.</div>
          )}
        </div>
      </section>

      {initial?.source === 'excel_import' ? (
        <div className="progress-import-note"><FileSpreadsheet size={16} /> السجل ده مستورد من Excel، والنسخة الأصلية من أرقامه محفوظة للمراجعة.</div>
      ) : null}

      <div className="progress-form-actions">
        {!initial && saved ? <button className="btn btn-ghost" type="button" disabled={submitting} onClick={() => {
          requestRef.current = null
          setSaved(false)
          setSaveAlias(false)
          setForm({ ...emptyForm, report_date: businessToday })
          setNewFiles([])
          setExistingAttachments([])
          setRemoveAttachmentIds([])
          setProjectMode('linked')
        }}>تسجيل متابعة جديدة</button> : null}
        {onCancel ? <button className="btn btn-ghost" type="button" onClick={onCancel}><X size={16} /> إلغاء</button> : null}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {projectMode === 'linked' ? <Link2 size={16} /> : <Save size={16} />}
          {submitting ? 'جاري الحفظ...' : initial ? 'حفظ التعديلات' : 'حفظ المتابعة'}
        </button>
      </div>
    </form>
  )
}
