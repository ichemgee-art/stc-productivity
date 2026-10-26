import { useMemo, useState } from 'react'
import { Calculator, Database, FileSpreadsheet, Link2, Save, X } from 'lucide-react'

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
    project_name: initialLinked ? '' : (initial?.project || initial?.project_name_snapshot || ''),
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
    setError('')

    if (!form.report_date) return setError('اختار تاريخ المتابعة')
    if (projectMode === 'linked' && !form.project_id) return setError('اختار المشروع من قائمة المشاريع')
    if (projectMode === 'manual' && !form.project_name.trim()) return setError('اكتب اسم المشروع الجديد')
    if (form.contract_quantity !== '' && Number(form.contract_quantity) < 0) return setError('كميات العقد لا يمكن أن تكون سالبة')
    if (projectMode === 'linked' && Number(form.historical_before_system || 0) < 0) return setError('كميات ما قبل النظام لا يمكن أن تكون سالبة')
    if (projectMode === 'manual' && Number(form.manual_executed_quantity || 0) < 0) return setError('الكميات المنفذة لا يمكن أن تكون سالبة')

    await onSubmit({
      id: initial?.id || null,
      report_date: form.report_date,
      review_yahya_date: form.review_yahya_date || '',
      review_marina_date: form.review_marina_date || '',
      review_abdelrahman_date: form.review_abdelrahman_date || '',
      project_id: projectMode === 'linked' ? form.project_id : '',
      project_name: projectMode === 'manual' ? form.project_name.trim() : selectedProject?.name || '',
      location: form.location.trim(),
      contract_quantity: form.contract_quantity === '' ? null : Number(form.contract_quantity),
      historical_before_system: projectMode === 'linked' ? Number(form.historical_before_system || 0) : 0,
      manual_executed_quantity: projectMode === 'manual' ? Number(form.manual_executed_quantity || 0) : null,
      execution_mode: projectMode,
      financial_status: form.financial_status.trim(),
      contract_type: form.contract_type.trim(),
      responsible_team: form.responsible_team.trim(),
      notes: form.notes.trim(),
    })
  }

  return (
    <form className="progress-entry-form" onSubmit={submit}>
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
            <span>تاريخ المتابعة</span>
            <input type="date" max={businessToday || undefined} value={form.report_date} onChange={(e) => setField('report_date', e.target.value)} />
          </label>

          <label className="field">
            <span>مصدر المشروع</span>
            <select value={projectMode} onChange={(e) => {
              const next = e.target.value
              setProjectMode(next)
              if (next === 'manual') setField('project_id', '')
            }}>
              <option value="linked">مشروع موجود في السيستم</option>
              <option value="manual">مشروع جديد / إدخال يدوي</option>
            </select>
          </label>

          {projectMode === 'linked' ? (
            <label className="field progress-field-wide">
              <span>المشروع</span>
              <select value={form.project_id} onChange={(e) => setField('project_id', e.target.value)}>
                <option value="">اختار المشروع...</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
          ) : (
            <label className="field progress-field-wide">
              <span>اسم المشروع</span>
              <input value={form.project_name} onChange={(e) => setField('project_name', e.target.value)} placeholder="اكتب اسم المشروع كما تريد ظهوره في الجدول" maxLength={200} />
            </label>
          )}

          <label className="field progress-field-wide">
            <span>الموقع</span>
            <input value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder="مثال: العاصمة الإدارية، التجمع، العلمين..." maxLength={300} />
          </label>
        </div>
      </section>

      <section className="progress-form-card">
        <div className="progress-form-heading">
          <div>
            <span>02</span>
            <h3>الموقف التنفيذي</h3>
          </div>
          <p>كميات العقد يدوي. الكميات المنفذة تتحدث تلقائيًا من الإنتاجية عند ربط المشروع.</p>
        </div>

        <div className="progress-execution-grid">
          <label className="field">
            <span>كميات العقد</span>
            <input type="number" min="0" step="0.01" value={form.contract_quantity} onChange={(e) => setField('contract_quantity', e.target.value)} placeholder="0.00" />
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

      <section className="progress-form-card">
        <div className="progress-form-heading">
          <div>
            <span>03</span>
            <h3>باقي بيانات Excel</h3>
          </div>
          <p>نفس حقول الشيت الحالية، وتقدر تعدلها بعد الحفظ من الجدول.</p>
        </div>

        <div className="progress-review-dates">
          <label className="field"><span>آخر مراجعة — م. يحيي حسين</span><input type="date" value={form.review_yahya_date} onChange={(e) => setField('review_yahya_date', e.target.value)} /></label>
          <label className="field"><span>آخر مراجعة — م. مارينا سامي</span><input type="date" value={form.review_marina_date} onChange={(e) => setField('review_marina_date', e.target.value)} /></label>
          <label className="field"><span>آخر مراجعة — م. عبدالرحمن حسين</span><input type="date" value={form.review_abdelrahman_date} onChange={(e) => setField('review_abdelrahman_date', e.target.value)} /></label>
        </div>

        <div className="progress-form-grid">
          <label className="field progress-field-wide">
            <span>الموقف المالي</span>
            <textarea rows={3} value={form.financial_status} onChange={(e) => setField('financial_status', e.target.value)} placeholder="اكتب موقف المستخلصات أو المستحقات..." />
          </label>
          <label className="field">
            <span>نوع التعاقد</span>
            <input value={form.contract_type} onChange={(e) => setField('contract_type', e.target.value)} placeholder="توريد وتركيب / مطالبة..." />
          </label>
          <label className="field">
            <span>الطاقم المسئول عن استكمال الأعمال</span>
            <input value={form.responsible_team} onChange={(e) => setField('responsible_team', e.target.value)} placeholder="اسم المهندس / المجموعة" />
          </label>
          <label className="field progress-field-wide">
            <span>ملاحظات</span>
            <textarea rows={4} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="أي ملاحظات تشغيلية أو متابعة..." />
          </label>
        </div>
      </section>

      {initial?.source === 'excel_import' ? (
        <div className="progress-import-note"><FileSpreadsheet size={16} /> السجل ده مستورد من Excel، والنسخة الأصلية من أرقامه محفوظة للمراجعة.</div>
      ) : null}

      {error ? <div className="inline-error">{error}</div> : null}

      <div className="progress-form-actions">
        {onCancel ? <button className="btn btn-ghost" type="button" onClick={onCancel}><X size={16} /> إلغاء</button> : null}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {projectMode === 'linked' ? <Link2 size={16} /> : <Save size={16} />}
          {submitting ? 'جاري الحفظ...' : initial ? 'حفظ التعديلات' : 'حفظ المتابعة'}
        </button>
      </div>
    </form>
  )
}
