import { useMemo, useRef, useState } from 'react'
import { Check, CheckCircle2, Layers3, LoaderCircle } from 'lucide-react'
import PeoplePicker from './PeoplePicker'
import { number } from '../lib/format'
import { calculateSubmissionPreview } from '../lib/calculations'
import { useFeedback } from '../context/FeedbackContext'
import { playFeedbackSound } from '../lib/feedbackSound'

const emptyTeam = { engineer: [], technician: [], assistant: [], worker: [] }
export default function SubmissionForm({ references, initial, onSubmit, submitting, mode = 'create' }) {
  const feedback = useFeedback()
  const formRef = useRef(null)
  const sectionRef = useRef(null)
  const [saveVisual, setSaveVisual] = useState('idle')
  const [successOverlay, setSuccessOverlay] = useState(null)
  const [form, setForm] = useState({
    work_date: initial?.work_date || references.businessToday || '',
    project: initial?.project || '',
    section: initial?.section || '',
    meters: initial?.meters ?? '',
  })
  const [team, setTeam] = useState(initial?.team || emptyTeam)
  const [submitMode, setSubmitMode] = useState('save')
  const [formError, setFormError] = useState('')

  const matchedSection = references.sections.find((item) => item.name === form.section)
  const section = matchedSection || (
    mode === 'edit' && initial?.section === form.section
      ? { id: 'historical-section', name: form.section, price_per_meter: initial?.price_per_meter ?? 0, active: false, historical: true }
      : undefined
  )
  const rules = references.rules || {}
  const techShare = Number(rules.tech_share ?? 0.7)
  const workerRate = Number(rules.worker_rate_per_meter ?? 10)
  const metersNumber = Number(form.meters)
  const metersValid = form.meters !== '' && Number.isFinite(metersNumber) && metersNumber >= 0
  const businessToday = references.businessToday || ''

  const preview = useMemo(() => {
    const result = calculateSubmissionPreview({
      meters: metersValid ? metersNumber : 0,
      pricePerMeter: Number(section?.price_per_meter || 0),
      technicianCount: team.technician.length,
      assistantCount: team.assistant.length,
      workerCount: team.worker.length,
      techShare,
      workerRatePerMeter: workerRate,
    })

    return {
      meters: result.meters,
      price: result.price,
      total: result.total,
      tech: result.techPerPerson,
      assistant: result.assistantPerPerson,
      worker: result.workerPerPerson,
    }
  }, [metersValid, metersNumber, section?.price_per_meter, team, techShare, workerRate])

  const sectionOptions = useMemo(() => {
    const options = references.sections.filter((item) => item.active || (mode === 'edit' && item.name === form.section))
    if (mode === 'edit' && form.section && !options.some((item) => item.name === form.section)) {
      options.push({
        id: 'historical-section',
        name: form.section,
        price_per_meter: initial?.price_per_meter ?? 0,
        active: false,
        historical: true,
      })
    }
    return options
  }, [references.sections, mode, form.section, initial?.price_per_meter])
  const projectOptions = useMemo(
    () => references.projects.filter((item) => item.active || (mode === 'edit' && item.name === form.project)),
    [references.projects, mode, form.project],
  )

  const personName = (id) => references.people.find((person) => person.id === id)?.name || '—'
  const teamNames = useMemo(() => ({
    engineer: team.engineer.map(personName),
    technician: team.technician.map(personName),
    assistant: team.assistant.map(personName),
    worker: team.worker.map(personName),
  }), [team, references.people])

  const dateValid = Boolean(form.work_date && (!businessToday || form.work_date <= businessToday))
  const projectValid = Boolean(form.project.trim() && form.project.trim().length <= 200)
  const ready = Boolean(dateValid && projectValid && form.section && metersValid)
  const steps = {
    date: dateValid,
    project: projectValid,
    section: Boolean(form.section),
    meters: metersValid,
    team: true,
    review: ready,
  }

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const setRole = (role, value) => setTeam((current) => ({ ...current, [role]: value }))

  const fail = (message) => {
    setFormError(message)
    feedback.error('راجع بيانات العملية', message)
  }

  const submit = async (event) => {
    event.preventDefault()
    setFormError('')

    if (!form.work_date) return fail('اختار تاريخ العملية')
    if (businessToday && form.work_date > businessToday) return fail('لا يمكن تسجيل إنتاجية بتاريخ مستقبلي')
    if (!form.project.trim()) return fail('اسم المشروع مطلوب')
    if (form.project.trim().length > 200) return fail('اسم المشروع طويل جدًا')
    if (!form.section) return fail('اختار القطاع')
    if (!metersValid) return fail('اكتب عدد الأمتار بشكل صحيح')

    try {
      setSaveVisual('saving')
      const result = await onSubmit({
        form: { ...form, meters: preview.meters },
        team,
        submitMode: 'save',
      })
      setSaveVisual('success')
      if (mode === 'create') {
        setSuccessOverlay({
          project: form.project.trim(),
          section: form.section,
          meters: preview.meters,
          total: Number(result?.total || preview.total || 0),
          duplicatePrevented: Boolean(result?.duplicate_prevented),
        })
        playFeedbackSound('success')
      }
    } catch (error) {
      setSaveVisual('idle')
      const message = error.message || 'تعذر حفظ العملية'
      setFormError(message)
      feedback.error('تعذر حفظ العملية', message)
    }
  }

  const startFreshSubmission = () => {
    setForm({
      work_date: businessToday || '',
      project: '',
      section: '',
      meters: '',
    })
    setTeam(emptyTeam)
    setFormError('')
    setSuccessOverlay(null)
    setSaveVisual('idle')
    setSubmitMode('save')
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const repeatWithAnotherSection = () => {
    setForm((current) => ({ ...current, section: '' }))
    setFormError('')
    setSuccessOverlay(null)
    setSaveVisual('idle')
    setSubmitMode('save')
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      sectionRef.current?.focus()
    })
  }

  return (
    <form ref={formRef} className="submission-form" onSubmit={submit} noValidate>
      <div className="entry-flow" aria-label="ترتيب إدخال الإنتاجية">
        <span className={steps.date ? 'completed' : ''}><b>{steps.date ? <Check size={13} /> : '1'}</b> التاريخ</span>
        <span className={steps.project ? 'completed' : ''}><b>{steps.project ? <Check size={13} /> : '2'}</b> المشروع</span>
        <span className={steps.section ? 'completed' : ''}><b>{steps.section ? <Check size={13} /> : '3'}</b> القطاع</span>
        <span className={steps.meters ? 'completed' : ''}><b>{steps.meters ? <Check size={13} /> : '4'}</b> الأمتار</span>
        <span className={steps.team ? 'completed' : ''}><b>{steps.team ? <Check size={13} /> : '5'}</b> فريق العمل</span>
        <span className={steps.review ? 'completed' : ''}><b>{steps.review ? <Check size={13} /> : '6'}</b> مراجعة وحفظ</span>
      </div>

      <section className="form-section">
        <div className="section-heading">
          <div><span className="section-kicker">01</span><h3>بيانات العملية</h3></div>
          <p>التاريخ والمشروع والقطاع وحجم التنفيذ.</p>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>التاريخ</span>
            <input type="date" max={businessToday || undefined} required value={form.work_date} onChange={(e) => setField('work_date', e.target.value)} />
          </label>
          <label className="field">
            <span>المشروع</span>
            <input list="project-options" maxLength={200} required value={form.project} onChange={(e) => setField('project', e.target.value)} placeholder="اختار أو اكتب مشروع جديد" />
            <datalist id="project-options">
              {projectOptions.map((project) => <option key={project.id} value={project.name} />)}
            </datalist>
          </label>
          <label className="field">
            <span>القطاع</span>
            <select ref={sectionRef} required value={form.section} onChange={(e) => setField('section', e.target.value)}>
              <option value="">اختار القطاع</option>
              {sectionOptions.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name} — {number(item.price_per_meter)} ج.م/م{item.historical ? ' · محفوظ تاريخيًا' : !item.active ? ' · معطل تاريخيًا' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>عدد الأمتار</span>
            <input type="number" min="0" step="0.01" required value={form.meters} onChange={(e) => setField('meters', e.target.value)} placeholder="0.00" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <div><span className="section-kicker">02</span><h3>فريق التنفيذ — بالترتيب: مهندسين، فنيين، مساعدين، عمال</h3></div>
          <p>مسموح باختيار أكثر من فرد، أو اختيار "بدون" لأي دور غير موجود في العملية.</p>
        </div>
        <div className="picker-grid">
          <PeoplePicker title="المهندسين" role="engineer" people={references.people} selected={team.engineer} onChange={(v) => setRole('engineer', v)} />
          <PeoplePicker title="الفنيين" role="technician" people={references.people} selected={team.technician} onChange={(v) => setRole('technician', v)} />
          <PeoplePicker title="المساعدين" role="assistant" people={references.people} selected={team.assistant} onChange={(v) => setRole('assistant', v)} />
          <PeoplePicker title="العمال" role="worker" people={references.people} selected={team.worker} onChange={(v) => setRole('worker', v)} />
        </div>
      </section>

      <section className="calc-preview">
        <div><span>سعر المتر</span><strong>{number(preview.price)}</strong></div>
        <div><span>إجمالي العملية</span><strong>{number(preview.total)}</strong></div>
        <div><span>متوسط نصيب الفني</span><strong>{number(preview.tech)}</strong></div>
        <div><span>متوسط نصيب المساعد</span><strong>{number(preview.assistant)}</strong></div>
        <div><span>متوسط نصيب العامل</span><strong>{number(preview.worker)}</strong></div>
      </section>

      <section className={`submission-review-card ${ready ? 'is-ready' : ''}`}>
        <div className="review-card-head">
          <div><span className="section-kicker">03</span><div><h3>راجع العملية قبل الحفظ</h3><p>{ready ? 'البيانات الأساسية مكتملة — راجع الأسماء والأرقام ثم احفظ.' : 'أكمل البيانات المطلوبة ليصبح الملخص جاهزًا للحفظ.'}</p></div></div>
          <span className={`status-pill ${ready ? 'success' : 'warning'}`}>{ready ? 'جاهزة للحفظ' : 'غير مكتملة'}</span>
        </div>
        {mode === 'edit' ? <div className="form-hint">أي تعديل في بيانات العملية يعيد حالة المراجعة تلقائيًا إلى «لم تتم المراجعة» حتى يتم اعتمادها من جديد.</div> : null}
        <div className="review-grid">
          <div><span>التاريخ</span><strong>{form.work_date || '—'}</strong></div>
          <div><span>المشروع</span><strong>{form.project.trim() || '—'}</strong></div>
          <div><span>القطاع</span><strong>{form.section || '—'}</strong></div>
          <div><span>الأمتار</span><strong>{form.meters === '' ? '—' : number(preview.meters)}</strong></div>
          <div><span>سعر المتر</span><strong>{number(preview.price)} ج.م</strong></div>
          <div className="highlight"><span>إجمالي العملية</span><strong>{number(preview.total)} ج.م</strong></div>
        </div>
        <div className="review-team-grid">
          <div><span>المهندسين · {team.engineer.length}</span><p>{teamNames.engineer.join('، ') || 'بدون'}</p></div>
          <div><span>الفنيين · {team.technician.length}</span><p>{teamNames.technician.join('، ') || 'بدون'}</p></div>
          <div><span>المساعدين · {team.assistant.length}</span><p>{teamNames.assistant.join('، ') || 'بدون'}</p></div>
          <div><span>العمال · {team.worker.length}</span><p>{teamNames.worker.join('، ') || 'بدون'}</p></div>
        </div>
      </section>

      {formError ? <div className="form-error">{formError}</div> : null}
      <footer className="form-actions">
        <button className={`btn save-operation-btn ${saveVisual === 'success' ? 'is-success' : 'btn-primary'}`} disabled={submitting || saveVisual === 'saving' || Boolean(successOverlay)} type="submit" onClick={() => setSubmitMode('save')}>
          {saveVisual === 'saving' || submitting ? <><LoaderCircle className="spin-icon" size={18} /> جاري الحفظ...</> : saveVisual === 'success' ? <><Check size={18} /> تم الحفظ</> : mode === 'edit' ? 'حفظ التعديلات' : 'حفظ العملية'}
        </button>
      </footer>

      {mode === 'create' && successOverlay ? (
        <div className="submission-success-backdrop" role="presentation">
          <section className="submission-success-modal" role="dialog" aria-modal="true" aria-labelledby="submission-success-title">
            <div className="submission-success-check" aria-hidden="true">
              <CheckCircle2 size={82} strokeWidth={1.8} />
            </div>
            <div className="submission-success-copy">
              <span>OPERATION SAVED</span>
              <h2 id="submission-success-title">{successOverlay.duplicatePrevented ? 'العملية محفوظة بالفعل' : 'تم تسجيل الإنتاجية بنجاح'}</h2>
              <p>{successOverlay.project} · {successOverlay.section} · {number(successOverlay.meters)} متر</p>
            </div>

            <div className="submission-success-summary">
              <div><span>المشروع</span><strong>{successOverlay.project}</strong></div>
              <div><span>القطاع</span><strong>{successOverlay.section}</strong></div>
              <div><span>الأمتار</span><strong>{number(successOverlay.meters)} م</strong></div>
              <div><span>الإجمالي</span><strong>{number(successOverlay.total)} ج.م</strong></div>
            </div>

            <div className="submission-success-actions">
              <button className="btn btn-primary submission-success-primary" type="button" onClick={startFreshSubmission}>
                <Check size={18} />
                <span><strong>حفظ العملية</strong><small>مسح البيانات وبدء عملية جديدة</small></span>
              </button>
              <button className="btn btn-secondary submission-success-repeat" type="button" onClick={repeatWithAnotherSection}>
                <Layers3 size={18} />
                <span><strong>نفس العملية — تغيير القطاع</strong><small>احتفظ بكل البيانات وامسح القطاع فقط</small></span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </form>
  )
}
