import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { appService } from '../services/appService'
import SubmissionForm from '../components/SubmissionForm'

function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function submissionFingerprint(form, team) {
  return JSON.stringify({
    work_date: form.work_date,
    project: form.project.trim(),
    section: form.section,
    meters: Number(form.meters),
    engineer: [...team.engineer].sort(),
    technician: [...team.technician].sort(),
    assistant: [...team.assistant].sort(),
    worker: [...team.worker].sort(),
  })
}

export default function NewSubmissionPage() {
  const queryClient = useQueryClient()
  const requestRef = useRef({ fingerprint: null, id: null })
  const [lastSaved, setLastSaved] = useState(null)
  const refsQuery = useQuery({ queryKey: ['references'], queryFn: appService.references })

  const mutation = useMutation({
    mutationFn: appService.createSubmission,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cycle-data'] })
      await queryClient.invalidateQueries({ queryKey: ['available-cycles'] })
      await queryClient.invalidateQueries({ queryKey: ['references'] })
    },
  })

  const save = async ({ form, team, submitMode }) => {
    const fingerprint = submissionFingerprint(form, team)
    if (requestRef.current.fingerprint !== fingerprint || !requestRef.current.id) {
      requestRef.current = { fingerprint, id: newRequestId() }
    }

    const result = await mutation.mutateAsync({
      p_work_date: form.work_date,
      p_project_name: form.project.trim(),
      p_section_name: form.section,
      p_meters: Number(form.meters),
      p_engineer_ids: team.engineer,
      p_technician_ids: team.technician,
      p_assistant_ids: team.assistant,
      p_worker_ids: team.worker,
      p_source: 'react_dashboard',
      p_client_request_id: requestRef.current.id,
    })

    requestRef.current = { fingerprint: null, id: null }

    const saved = {
      project: form.project.trim(),
      work_date: form.work_date,
      section: form.section,
      meters: Number(form.meters),
      total: Number(result?.total || 0),
      submitMode,
      duplicatePrevented: Boolean(result?.duplicate_prevented),
    }

    setLastSaved(saved)
    return result
  }

  if (refsQuery.isLoading) return <div className="page-loader">جاري تجهيز شاشة الإدخال...</div>
  if (refsQuery.isError) return <div className="page-error">{refsQuery.error.message}</div>

  return (
    <div className="page-stack">
      <section className="entry-callout"><div><strong>إدخال سريع وآمن</strong><p>تقدر تختار أكثر من مهندس وفني ومساعد وعامل. السعر والإجمالي والأنصبة النهائية يتم تثبيتها في Supabase وقت الحفظ.</p></div></section>
      {lastSaved ? (
        <section className="saved-receipt">
          <span className="saved-receipt__icon"><CheckCircle2 size={24} /></span>
          <div className="saved-receipt__copy">
            <strong>{lastSaved.duplicatePrevented ? 'تم منع تسجيل العملية مرتين' : 'تم حفظ آخر عملية بنجاح'}</strong>
            <p>{lastSaved.project} · {lastSaved.section} · {lastSaved.meters} متر · إجمالي {lastSaved.total.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م</p>
          </div>
          <button className="saved-receipt__close" type="button" onClick={() => setLastSaved(null)}>×</button>
        </section>
      ) : null}
      <SubmissionForm references={refsQuery.data} onSubmit={save} submitting={mutation.isPending} />
    </div>
  )
}
