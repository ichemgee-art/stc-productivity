import { useMemo, useRef, useState } from 'react'
import { Building2, Calculator, Database, FileSpreadsheet, Link2, PenLine, Save, X } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { progressRequest } from '../lib/projectProgress'

const emptyForm = {
  report_date: '',
  review_yahya_date: '',
  review_marina_date: '',
  review_abdelrahman_date: '',
  project_id: '',
  project_name: '',
  location: '',
  contract_quantity: '',
  historical_before_system: '',
  manual_executed_quantity: '',
  financial_status: '',
  contract_type: '',
  responsible_team: '',
  notes: '',
}

const toInput = (value) => value == null ? '' : String(value)

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
  const [saveAlias, setSaveAlias] = useState(false)
  const [saved, setSaved] = useState(false)
  const originalName = initial?.original_project_name || initial?.project_name_snapshot || initial?.project || ''
  const businessToday = references?.businessToday || ''
  const initialLinked = Boolean(initial?.project_id)
  const [projectMode, setProjectMode] = useState(initial ? (initialLinked ? 'linked' : 'manual') : 'linked')
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    report_date: initial?.report_date || businessToday,
    review_yahya_date: initial?.review_yahya_date || '',
    review_marina_date: initial?.review_marina_date || '',
    review_abdelrahman_date: initial?.review_abdelrahman_date || '',
    project_id: initial?.project_id || '',
    project_name: initial?.project || initial?.project_name_snapshot || '',
    location: initial?.location || '',
    contract_quantity: toInput(initial?.contract_quantity),
    historical_before_system: toInput(initial?.historical_before_system),
    manual_executed_quantity: toInput(initial?.manual_executed_quantity ?? initial?.executed_quantity),
    financial_status: initial?.financial_status || '',
    contract_type: initial?.contract_type || '',
    responsible_team: initial?.responsible_team || '',
    notes: initial?.notes || '',
  }))
  const [error, setError] = useState('')

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
    if (form.contract_quantity !== '' && Number(form.contract_quantity) < 0) return setError('كميات العقد لا يمكن أن تكون سالبة')
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
      contract_quantity: form.contract_quantity === '' ? null : Number(form.contract_quantity),
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
      await onSubmit({ ...payload, request_id: requestRef.current.id })
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
        </div>
      </section>

      <section className="progress-form-card">
        <div className="progress-form-heading">
          <div>
            <span>02</span>
            <h3>الموقف التنفيذي</h3>
          </div>
          <p>أدخل كميات العقد فقط، والسيستم هيحسب المنفذ ونسبة التنفيذ تلقائيًا حسب نوع المشروع.</p>
        </div>

        <div className="progress-execution-grid">
          <label className="field">
            <span>كميات العقد</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={form.contract_quantity} onChange={(e) => setField('contract_quantity', e.target.value)} placeholder="مثال: 1250" />
            <small className="progress-field-hint">إجمالي الكمية المتعاقد عليها للمشروع.</small>
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

      {executionPercent > 100 ? <div role="status" className="progress-import-note">التنفيذ تجاوز كمية العقد بـ {(executionPercent - 100).toFixed(2)}%</div> : null}

      <section className="progress-form-card">
        <div className="progress-form-heading">
          <div>
            <span>03</span>
            <h3>المراجعات والبيانات الإضافية</h3>
          </div>
          <p>سجل تواريخ المراجعة والموقف المالي والتعاقد والطاقم والملاحظات بشكل واضح.</p>
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
