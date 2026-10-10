import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bot, Send, Sparkles, X } from 'lucide-react'
import { useCycle } from '../context/CycleContext'
import { appService } from '../services/appService'
import { monthName } from '../lib/format'

const starterQuestions = [
  'إيه المشاريع اللي إنتاجيتها أقل؟',
  'أنهي القطاعات حققت أعلى عدد أمتار؟',
  'اديني ملخص تشغيلي للدورة الحالية.',
]

const SENSITIVE_AI_PATTERN = /(مستحق|استحقاق|أجر|مرتب|راتب|حضور|غياب|غائب|إجاز|عامل|فني|مساعد|مهندس|شخص|اسم|مين|attendance|absence|salary|wage|worker|technician|assistant|engineer)/i

export default function AIAssistant() {
  const { monthKey, selectedCycle } = useCycle()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'اسألني عن الإنتاجية والمشاريع والقطاعات في الدورة المعروضة. بيانات الأفراد والحضور والمستحقات لا يتم إرسالها للـAI.' },
  ])

  const rowsQuery = useQuery({
    queryKey: ['cycle-data', 'ai-rows', monthKey],
    queryFn: () => appService.productivityRows(selectedCycle.cycle_start, selectedCycle.cycle_end),
    enabled: Boolean(open && selectedCycle),
    staleTime: 30_000,
  })

  const refsQuery = useQuery({
    queryKey: ['ai-references'],
    queryFn: appService.references,
    enabled: open,
    staleTime: 60_000,
  })

  const context = useMemo(() => {
    const rows = rowsQuery.data || []

    return {
      cycle: {
        monthKey,
        label: monthName(monthKey),
        start: selectedCycle?.cycle_start,
        end: selectedCycle?.cycle_end,
      },
      summary: {
        operationCount: rows.length,
        meters: rows.reduce((sum, row) => sum + Number(row.meters || 0), 0),
        productivityValue: rows.reduce((sum, row) => sum + Number(row.total || 0), 0),
      },
      operations: rows.slice(0, 500).map((row) => ({
        date: row.work_date,
        project: row.project,
        section: row.section,
        meters: Number(row.meters || 0),
        pricePerMeter: Number(row.price_per_meter || 0),
        total: Number(row.total || 0),
        review: row.review_status,
      })),
    }
  }, [monthKey, selectedCycle, rowsQuery.data])

  const dataLoading = rowsQuery.isLoading || refsQuery.isLoading

  const send = async (preset = '') => {
    const text = (preset || question).trim()
    if (!text || sending || !selectedCycle) return

    const personNames = (refsQuery.data?.people || [])
      .map((person) => String(person.name || '').trim())
      .filter(Boolean)
    const normalizedText = text.toLocaleLowerCase('ar-EG')
    const mentionsPerson = personNames.some((name) => normalizedText.includes(name.toLocaleLowerCase('ar-EG')))

    if (mentionsPerson || SENSITIVE_AI_PATTERN.test(text)) {
      setMessages((current) => [...current, {
        role: 'assistant',
        text: 'حفاظًا على خصوصية الشركة، بيانات الأفراد والحضور والغياب والمستحقات لا يتم إرسالها إلى Gemini. أقدر أحلل لك الإنتاجية والمشاريع والقطاعات فقط.',
      }])
      setQuestion('')
      return
    }

    const nextUser = { role: 'user', text }
    setMessages((current) => [...current, nextUser])
    setQuestion('')
    setSending(true)

    try {
      const response = await appService.askAI({
        question: text,
        history: messages.slice(-6),
        context,
      })
      setMessages((current) => [...current, {
        role: 'assistant',
        text: response?.answer || 'لم أتمكن من تكوين إجابة من البيانات الحالية.',
        model: response?.model,
      }])
    } catch (error) {
      const missingKey = /GEMINI_API_KEY|API key|secret/i.test(error?.message || '')
      setMessages((current) => [...current, {
        role: 'assistant',
        text: missingKey
          ? 'المساعد جاهز داخل النظام، لكن مفتاح Gemini لم يتم ربطه في Supabase Secrets بعد.'
          : `تعذر تشغيل المساعد: ${error?.message || 'حدث خطأ غير متوقع'}`,
        error: true,
      }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`ai-assistant ${open ? 'is-open' : ''}`}>
      {open ? (
        <section className="ai-panel">
          <header className="ai-panel__head">
            <div className="ai-panel__identity">
              <span><Sparkles size={18} /></span>
              <div><strong>مساعد الإنتاجية الذكي</strong><small>Gemini · بيانات تشغيلية فقط بدون بيانات أفراد</small></div>
            </div>
            <button className="icon-btn small" type="button" onClick={() => setOpen(false)}><X size={17} /></button>
          </header>

          <div className="ai-messages">
            {messages.map((message, index) => (
              <div className={`ai-message ${message.role} ${message.error ? 'error' : ''}`} key={index}>
                <div>{message.text}</div>
                {message.model ? <small>{message.model}</small> : null}
              </div>
            ))}
            {sending ? <div className="ai-message assistant loading">جاري تحليل البيانات...</div> : null}
          </div>

          {messages.length === 1 ? (
            <div className="ai-starters">
              {starterQuestions.map((item) => (
                <button key={item} type="button" onClick={() => send(item)} disabled={dataLoading || sending}>{item}</button>
              ))}
            </div>
          ) : null}

          <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={dataLoading ? 'جاري تجهيز بيانات الدورة...' : 'اسأل عن أي رقم أو مقارنة في الدورة...'}
              rows={2}
              disabled={dataLoading || sending}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            <button className="btn btn-primary" type="submit" disabled={!question.trim() || dataLoading || sending}>
              <Send size={16} />
            </button>
          </form>
        </section>
      ) : null}

      <button
        className="ai-floating-button"
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="مساعد الإنتاجية الذكي"
        aria-label="مساعد الإنتاجية الذكي"
      >
        <Bot size={22} />
        <span>AI</span>
      </button>
    </div>
  )
}
