import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BriefcaseBusiness, CalendarCheck2, CalendarX2, CircleDollarSign, MessageSquareText, Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import { appService } from '../services/appService'
import { useCycle } from '../context/CycleContext'
import { useAuth } from '../context/AuthContext'
import { date, money, number, roleLabels, rolePlural } from '../lib/format'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import PersonDetailsModal from '../components/PersonDetailsModal'
import { useFeedback } from '../context/FeedbackContext'

const roleAvatars = {
  engineer: '/avatars/engineer.png',
  technician: '/avatars/technician.png',
  assistant: '/avatars/assistant-technician.png',
  worker: '/avatars/worker.png',
}

export default function PeoplePage({ role = 'engineer' }) {
  const { monthKey, selectedCycle } = useCycle()
  const { permissions } = useAuth()
  const queryClient = useQueryClient()
  const feedback = useFeedback()
  const [editing, setEditing] = useState(null)
  const [details, setDetails] = useState(null)

  const statsQuery = useQuery({
    queryKey: ['cycle-data', 'people-stats', monthKey, role],
    queryFn: () => appService.personStats(monthKey, role),
    enabled: Boolean(monthKey),
  })
  const notesQuery = useQuery({
    queryKey: ['cycle-data', 'person-notes', monthKey, role],
    queryFn: () => appService.personNotes(role, selectedCycle.cycle_start, selectedCycle.cycle_end),
    enabled: Boolean(selectedCycle),
  })
  const attendanceQuery = useQuery({
    queryKey: ['cycle-data', 'attendance', monthKey],
    queryFn: () => appService.attendance(monthKey),
    enabled: Boolean(monthKey),
  })
  const peopleQuery = useQuery({ queryKey: ['people', role], queryFn: () => appService.people(role) })

  const rows = useMemo(() => {
    const statsMap = new Map((statsQuery.data || []).map((row) => [row.person_id, row]))
    const notesMap = new Map()
    const attendanceMap = new Map()

    ;(notesQuery.data || []).forEach((note) => {
      const current = notesMap.get(note.person_id) || []
      current.push(note)
      notesMap.set(note.person_id, current)
    })

    ;(attendanceQuery.data || []).forEach((row) => {
      const current = attendanceMap.get(row.person_id) || []
      current.push(row)
      attendanceMap.set(row.person_id, current)
    })

    return (peopleQuery.data || []).map((person) => {
      const stats = statsMap.get(person.id) || { tasks: 0, meters: 0, earnings: 0, present_days: 0, absent_days: 0, upcoming_days: 0, pool_percent: 0 }
      const operationNotes = notesMap.get(person.id) || []
      const attendanceRows = attendanceMap.get(person.id) || []
      const attendanceNotes = attendanceRows
        .filter((row) => row.note)
        .map((row) => ({
          note: row.note,
          note_date: row.attendance_date,
          kind: row.status === 'absent' ? 'ملاحظة غياب' : 'ملاحظة حضور',
          project: '',
        }))

      const operationNoteCandidates = operationNotes
        .filter((note) => note.note)
        .map((note) => ({
          note: note.note,
          note_date: note.work_date,
          kind: 'ملاحظة عملية',
          project: note.project || '',
        }))

      const noteCandidates = [...operationNoteCandidates, ...attendanceNotes]
        .sort((a, b) => String(b.note_date || '').localeCompare(String(a.note_date || '')))

      const present = Number(stats.present_days || 0)
      const absent = Number(stats.absent_days || 0)
      const completedDays = present + absent

      return {
        ...person,
        ...stats,
        operation_notes: operationNotes,
        excused_absence_days: attendanceRows.filter((row) => row.status === 'absent' && row.absence_type === 'excused').length,
        unexcused_absence_days: attendanceRows.filter((row) => row.status === 'absent' && row.absence_type === 'unexcused').length,
        friday_present_days: attendanceRows.filter((row) => row.status === 'present' && row.is_friday).length,
        attendance_rate: completedDays ? (present / completedDays) * 100 : 0,
        latest_note: noteCandidates[0] || null,
        notes_count: noteCandidates.length,
      }
    })
  }, [statsQuery.data, notesQuery.data, attendanceQuery.data, peopleQuery.data])

  const refreshPeople = async () => {
    await queryClient.invalidateQueries({ queryKey: ['people'] })
    await queryClient.invalidateQueries({ queryKey: ['references'] })
    await queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
  }

  const saveMutation = useMutation({
    mutationFn: appService.savePerson,
    onSuccess: async (_data, variables) => {
      setEditing(null)
      await refreshPeople()
      feedback.success(variables.id ? 'تم تحديث بيانات الشخص' : 'تم إضافة الاسم', 'تم حفظ التغيير بنجاح.')
    },
    onError: (err) => feedback.error('تعذر حفظ بيانات الشخص', err.message || 'حدث خطأ غير متوقع'),
  })

  const deleteMutation = useMutation({
    mutationFn: appService.deletePerson,
    onError: (err) => feedback.error('تعذر حذف الشخص', err.message || 'حدث خطأ غير متوقع'),
  })

  const removePerson = async (person) => {
    const accepted = await feedback.confirm({
      title: 'حذف الشخص؟',
      message: 'سيتم الحذف فقط إذا لم يكن الاسم مرتبطًا بأي بيانات تاريخية.',
      details: `${person.name} · ${roleLabels[person.role]}`,
      confirmLabel: 'فحص وحذف',
      cancelLabel: 'رجوع',
      tone: 'danger',
    })
    if (!accepted) return

    const result = await deleteMutation.mutateAsync(person.id)
    if (result?.blocked) {
      const links = Number(result.submission_links || 0)
      const absences = Number(result.absence_links || 0)
      const notes = Number(result.note_links || 0)
      const disable = await feedback.confirm({
        title: 'لا يمكن حذف الاسم بسبب التاريخ',
        message: 'الاسم مرتبط ببيانات قديمة ويجب الحفاظ عليها. يمكن تعطيله بدل الحذف حتى لا يظهر في الإدخالات الجديدة.',
        details: `عمليات: ${links} · غياب: ${absences} · ملاحظات: ${notes}`,
        confirmLabel: person.active ? 'تعطيل الاسم' : 'إغلاق',
        cancelLabel: 'رجوع',
        tone: person.active ? 'primary' : 'danger',
      })
      if (disable && person.active) {
        await saveMutation.mutateAsync({ id: person.id, name: person.name, role: person.role, active: false })
      }
      return
    }

    await refreshPeople()
    feedback.deleted('تم حذف الشخص', `تم حذف ${person.name} نهائيًا لأنه غير مرتبط ببيانات تاريخية.`)
  }

  const showDetails = (person) => setDetails(person)

  const loading = statsQuery.isLoading || notesQuery.isLoading || attendanceQuery.isLoading || peopleQuery.isLoading
  const loadError = statsQuery.error || notesQuery.error || attendanceQuery.error || peopleQuery.error
  if (loading) return <div className="page-loader">جاري تحميل بيانات {rolePlural[role] || 'الأفراد'}...</div>
  if (loadError) return <div className="page-error">{loadError.message || 'تعذر تحميل بيانات الأفراد'}</div>

  return (
    <div className="page-stack">
      <section className="people-headline">
        <div><span className="eyebrow">TEAM PERFORMANCE</span><h2>{rolePlural[role]}</h2><p>ملخص سريع للـHR: المستحقات، الحضور، الغياب وأحدث الملاحظات لكل شخص.</p></div>
        {permissions.canManagePeople ? <button className="btn btn-primary" onClick={() => setEditing({ id: null, name: '', role, active: true })}><Plus size={17} /> إضافة اسم</button> : null}
      </section>

      <section className="people-grid people-grid-pro">
        {rows.map((person) => {
          const hasEngineerZeroDues = person.role === 'engineer' && Number(person.earnings || 0) === 0
          return (
            <article className={`person-profile-card person-hr-card ${!person.active ? 'inactive' : ''}`} key={person.id}>
              <header className="person-profile-top person-hr-card__header">
                <div className="person-profile-main">
                  <div className="person-avatar-pro">
                    {Object.hasOwn(roleAvatars, person.role) ? (
                      <img
                        src={roleAvatars[person.role]}
                        alt={`صورة رمزية — ${roleLabels[person.role]} — ${person.name}`}
                        width={52}
                        height={52}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : person.name.slice(0, 1)}
                  </div>
                  <div className="person-profile-copy">
                    <strong>{person.name}</strong>
                    <div>
                      <span className="role-badge">{roleLabels[role]}</span>
                      <span className={`availability-dot ${person.active ? 'active' : ''}`}>{person.active ? 'نشط' : 'معطل'}</span>
                    </div>
                  </div>
                </div>

                {permissions.canManagePeople ? (
                  <div className="card-head-actions person-card-admin-actions" aria-label="إدارة الشخص">
                    <button className="icon-btn small" title="تعديل البيانات" aria-label="تعديل البيانات" onClick={() => setEditing(person)}><Pencil size={15} /></button>
                    <button className="icon-btn small danger" title="حذف الاسم" aria-label="حذف الاسم" onClick={() => removePerson(person)}><Trash2 size={15} /></button>
                  </div>
                ) : null}
              </header>

              <section className={`person-earnings-hero ${hasEngineerZeroDues ? 'is-zero-engineer' : ''}`}>
                <div className="person-earnings-hero__icon"><CircleDollarSign size={21} /></div>
                <div className="person-earnings-hero__copy">
                  <span>مستحق الدورة</span>
                  {hasEngineerZeroDues ? <strong className="person-no-dues">لا يوجد مستحق إنتاجية</strong> : <strong>{money(person.earnings)}</strong>}
                  <small>{Number(person.tasks || 0) ? `${number(person.tasks)} عملية · ${number(person.meters)} م` : 'لا توجد عمليات مسجلة في الدورة'}</small>
                </div>
                {Number(person.pool_percent || 0) > 0 ? <span className="person-pool-badge">Pool {number(person.pool_percent)}%</span> : null}
              </section>

              <section className="person-hr-attendance">
                <div className="person-attendance-rate">
                  <span>نسبة الحضور</span>
                  <strong>{number(person.attendance_rate, 1)}%</strong>
                </div>

                <div className="person-attendance-box is-present">
                  <div className="person-attendance-box__icon"><CalendarCheck2 size={18} /></div>
                  <div>
                    <span>الحضور</span>
                    <strong>{number(person.present_days)} يوم</strong>
                    <small>{person.friday_present_days ? `منها ${number(person.friday_present_days)} جمعة` : 'أيام الحضور المسجلة'}</small>
                  </div>
                </div>

                <div className="person-attendance-box is-absent">
                  <div className="person-attendance-box__icon"><CalendarX2 size={18} /></div>
                  <div>
                    <span>الغياب</span>
                    <strong>{number(person.absent_days)} يوم</strong>
                    <small><b>{number(person.excused_absence_days)} بإذن</b><i>·</i><b>{number(person.unexcused_absence_days)} بدون إذن</b></small>
                  </div>
                </div>
              </section>

              <section className="person-work-strip" aria-label="ملخص الإنتاجية">
                <span><BriefcaseBusiness size={15} /><b>{number(person.tasks)}</b> عملية</span>
                <span><Ruler size={15} /><b>{number(person.meters)}</b> م</span>
              </section>

              {person.latest_note ? (
                <section className="person-latest-note">
                  <div className="person-latest-note__head">
                    <span><MessageSquareText size={15} /> آخر ملاحظة</span>
                    {person.notes_count > 1 ? <b>+{number(person.notes_count - 1)}</b> : null}
                  </div>
                  <p>{person.latest_note.note}</p>
                  <small>
                    {person.latest_note.kind}
                    {person.latest_note.project ? ` · ${person.latest_note.project}` : ''}
                    {person.latest_note.note_date ? ` · ${date(person.latest_note.note_date)}` : ''}
                  </small>
                </section>
              ) : (
                <section className="person-latest-note is-empty">
                  <div className="person-latest-note__head"><span><MessageSquareText size={15} /> الملاحظات</span></div>
                  <p>لا توجد ملاحظات مسجلة خلال الدورة.</p>
                </section>
              )}

              <button className="person-details-cta person-hr-card__cta" type="button" onClick={() => showDetails(person)}>
                <div>
                  <span>عرض ملف الموظف</span>
                  <small>المستحقات · العمليات · الحضور والغياب · الملاحظات</small>
                </div>
                <ArrowLeft size={18} />
              </button>
            </article>
          )
        })}

        {!rows.length ? (
          <EmptyState
            title={`لسه مفيش ${rolePlural[role] || 'أفراد'}`}
            description="أضف أول اسم عشان يظهر في فريق التنفيذ والحضور والتقارير."
            actionLabel={permissions.canManagePeople ? 'إضافة أول اسم' : ''}
            onAction={permissions.canManagePeople ? () => setEditing({ id: null, name: '', role, active: true }) : undefined}
            hint="الأسماء النشطة فقط بتظهر للاختيار في عمليات الإنتاجية الجديدة."
          />
        ) : null}
      </section>

      <Modal open={Boolean(editing)} title={editing?.id ? 'تعديل بيانات الشخص' : 'إضافة اسم جديد'} onClose={() => setEditing(null)}>
        {editing ? <PersonForm person={editing} saving={saveMutation.isPending} onSave={(payload) => saveMutation.mutateAsync(payload)} /> : null}
      </Modal>

      <PersonDetailsModal person={details} selectedCycle={selectedCycle} monthKey={monthKey} onClose={() => setDetails(null)} />
    </div>
  )
}

function PersonForm({ person, saving, onSave }) {
  const [name, setName] = useState(person.name || '')
  const [active, setActive] = useState(person.active !== false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const cleanName = name.trim()
    if (!cleanName) return setError('الاسم مطلوب')
    if (cleanName.length > 120) return setError('الاسم طويل جدًا')
    try { await onSave({ id: person.id || null, name: cleanName, role: person.role, active }) } catch (err) { setError(err.message || 'تعذر الحفظ') }
  }

  return <form className="modal-form" onSubmit={submit} noValidate><label className="field"><span>الاسم</span><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="toggle-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>الاسم نشط ويمكن اختياره في العمليات الجديدة</span></label>{error ? <div className="form-error">{error}</div> : null}<button className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></form>
}
