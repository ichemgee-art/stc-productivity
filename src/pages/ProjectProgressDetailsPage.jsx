import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight, CalendarDays, ClipboardList, Coins, ExternalLink, File, FileImage, FileSpreadsheet,
  FileText, MapPin, Paperclip, Percent, Ruler, Trash2, Users,
} from 'lucide-react'
import { appService } from '../services/appService'
import { projectCategoryLabel } from '../lib/projectProgress'
import ExportButtons from '../components/ExportButtons'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../context/AuthContext'
import { useFeedback } from '../context/FeedbackContext'

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

const displayMoney = (value) => value == null || value === ''
  ? '—'
  : `${displayNumber(value)} ج.م`

const fileSize = (bytes) => {
  const value = Number(bytes || 0)
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024)).toLocaleString('en-US')} KB`
  return `${(value / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 1 })} MB`
}

const attachmentType = (mime) => mime === 'application/pdf'
  ? 'PDF'
  : mime?.startsWith('image/')
    ? 'صورة'
    : mime === 'application/vnd.ms-excel' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ? 'Excel'
      : 'Word'

export default function ProjectProgressDetailsPage() {
  const { recordId } = useParams()
  const exportRef = useRef(null)
  const queryClient = useQueryClient()
  const { permissions } = useAuth()
  const feedback = useFeedback()

  const recordQuery = useQuery({
    queryKey: ['project-progress', 'record', recordId],
    queryFn: () => appService.projectProgressRecord(recordId),
    enabled: Boolean(recordId),
  })
  const attachmentsQuery = useQuery({
    queryKey: ['project-progress', 'attachments', recordId],
    queryFn: () => appService.projectProgressAttachments(recordId),
    enabled: Boolean(recordId),
  })

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId) => appService.syncProjectProgressAttachments(recordId, {
      removeAttachmentIds: [attachmentId],
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-progress', 'attachments', recordId] }),
        queryClient.invalidateQueries({ queryKey: ['project-progress', 'record', recordId] }),
        queryClient.invalidateQueries({ queryKey: ['project-progress', 'rows'] }),
      ])
      feedback.deleted('تم مسح المرفق', 'تم حذف الملف من المشروع بنجاح.')
    },
    onError: (error) => feedback.error('تعذر مسح المرفق', error.message || 'حدث خطأ غير متوقع'),
  })

  const removeAttachment = async (item) => {
    const accepted = await feedback.confirm({
      title: 'مسح المرفق؟',
      message: 'سيتم حذف الملف نهائيًا من المشروع.',
      details: item.file_name,
      confirmLabel: 'مسح',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    })
    if (!accepted) return
    await deleteAttachmentMutation.mutateAsync(item.id)
  }

  useEffect(() => {
    if (window.location.hash === '#attachments' && !recordQuery.isLoading && !attachmentsQuery.isLoading) {
      window.requestAnimationFrame(() => document.getElementById('attachments')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [recordQuery.isLoading, attachmentsQuery.isLoading])

  if (recordQuery.isLoading || attachmentsQuery.isLoading) return <div className="page-loader">جاري تحميل ملف المشروع...</div>
  if (recordQuery.isError || attachmentsQuery.isError) {
    return <div className="page-error">{recordQuery.error?.message || attachmentsQuery.error?.message || 'تعذر تحميل ملف المشروع'}</div>
  }

  const row = recordQuery.data
  const attachments = attachmentsQuery.data || []

  if (!row) {
    return (
      <EmptyState
        title="متابعة المشروع غير موجودة"
        description="السجل المطلوب غير موجود أو تم حذفه."
        actionLabel="الرجوع لمتابعة المشاريع"
        onAction={() => { window.location.href = '/project-progress' }}
      />
    )
  }

  const excelSheets = [
    {
      name: row.project || 'المشروع',
      subtitle: `ملف متابعة مشروع · ${displayDate(row.report_date)}`,
      rows: [{
        'رقم المتابعة': row.display_number ?? '',
        'المشروع': row.project || '',
        'الموقع': row.location || '',
        'حالة المشروع': projectCategoryLabel(row.project_category),
        'تاريخ المتابعة': displayDate(row.report_date),
        'مراجعة م. يحيي حسين': displayDate(row.review_yahya_date),
        'مراجعة م. مارينا سامي': displayDate(row.review_marina_date),
        'مراجعة م. عبدالرحمن حسين': displayDate(row.review_abdelrahman_date),
        'كميات التعاقد + البنود المحملة على القطاعات': row.contract_quantity == null ? '' : Number(row.contract_quantity),
        'الكميات المنفذة': row.executed_quantity == null ? '' : Number(row.executed_quantity),
        'نسبة التنفيذ %': row.execution_percent == null ? '' : Number(row.execution_percent),
        'كمية التعاقد الأصلية': row.original_contract_quantity == null ? '' : Number(row.original_contract_quantity),
        'قيمة العقد (ج.م)': row.contract_value == null ? '' : Number(row.contract_value),
        'الموقف المالي': row.financial_status || '',
        'نوع التعاقد': row.contract_type || '',
        'الطاقم المسئول': row.responsible_team || '',
        'ملاحظات': row.notes || '',
        'عدد المرفقات': attachments.length,
      }],
    },
    {
      name: 'المرفقات',
      subtitle: `مرفقات مشروع ${row.project || ''}`,
      rows: attachments.map((item, index) => ({
        'م': index + 1,
        'اسم الملف': item.file_name,
        'النوع': attachmentType(item.mime_type),
        'الحجم': fileSize(item.file_size),
        'تاريخ الرفع': displayDate(item.created_at?.slice(0, 10)),
      })),
    },
  ]

  return (
    <div className="project-record-page">
      <div className="project-record-toolbar" data-html2canvas-ignore="true">
        <Link className="btn btn-ghost" to="/project-progress"><ArrowRight size={16} /> رجوع لمتابعة المشاريع</Link>
        <ExportButtons
          filename={`ملف-مشروع-${row.project || row.display_number || 'project'}`}
          excelSheets={excelSheets}
          pdfTarget={exportRef}
          compact
          showSuccess
          preferElementPdf
        />
      </div>

      <div className="project-record-export" ref={exportRef}>
        <section className="project-record-hero no-pdf-break">
          <div>
            <span className="eyebrow">PROJECT FOLLOW-UP FILE</span>
            <h2>{row.project || 'مشروع بدون اسم'}</h2>
            <p><MapPin size={15} /> {row.location || 'الموقع غير مسجل'}</p>
          </div>
          <div className="project-record-hero__meta">
            <span className={`progress-status-badge status-${row.project_category || 'unclassified'}`}>
              {projectCategoryLabel(row.project_category)}
            </span>
            <small>متابعة رقم {row.display_number ?? '—'} · {displayDate(row.report_date)}</small>
          </div>
        </section>

        <section className="project-record-kpis no-pdf-break">
          <article>
            <span><ClipboardList size={17} /> كميات التعاقد + البنود المحملة</span>
            <strong>{displayNumber(row.contract_quantity)} م</strong>
            <small>الأساس المستخدم في نسبة التنفيذ</small>
          </article>
          <article>
            <span><Ruler size={17} /> الكميات المنفذة</span>
            <strong>{displayNumber(row.executed_quantity)} م</strong>
            <small>{row.execution_mode === 'linked' ? 'محسوبة تلقائيًا من الإنتاجية' : 'إدخال يدوي'}</small>
          </article>
          <article>
            <span><Percent size={17} /> نسبة التنفيذ</span>
            <strong>{row.execution_percent == null ? '—' : `${displayNumber(row.execution_percent)}%`}</strong>
            <small>مقارنة بالكميات المحملة على القطاعات</small>
          </article>
          <article>
            <span><ClipboardList size={17} /> كمية التعاقد الأصلية</span>
            <strong>{displayNumber(row.original_contract_quantity)} م</strong>
            <small>قيمة مرجعية فقط</small>
          </article>
          <article>
            <span><Coins size={17} /> قيمة العقد</span>
            <strong>{displayMoney(row.contract_value)}</strong>
            <small>قيمة مرجعية بالجنيه المصري</small>
          </article>
        </section>

        <section className="project-record-grid">
          <article className="project-record-card project-record-reviews no-pdf-break">
            <header><CalendarDays size={18} /><div><strong>تواريخ آخر مراجعة</strong><small>آخر تاريخ مسجل لكل مهندس</small></div></header>
            <div className="project-record-review-list">
              <div><span>م. يحيي حسين</span><strong>{displayDate(row.review_yahya_date)}</strong></div>
              <div><span>م. مارينا سامي</span><strong>{displayDate(row.review_marina_date)}</strong></div>
              <div><span>م. عبدالرحمن حسين</span><strong>{displayDate(row.review_abdelrahman_date)}</strong></div>
            </div>
          </article>

          <article className="project-record-card no-pdf-break">
            <header><Users size={18} /><div><strong>بيانات التعاقد والفريق</strong><small>البيانات المسجلة في جدول المتابعة</small></div></header>
            <div className="project-record-facts">
              <div><span>نوع التعاقد</span><strong>{row.contract_type || '—'}</strong></div>
              <div><span>الطاقم المسئول</span><strong>{row.responsible_team || '—'}</strong></div>
              <div><span>مصدر التنفيذ</span><strong>{row.execution_mode === 'linked' ? 'مرتبط بالإنتاجية' : 'يدوي'}</strong></div>
              <div><span>منفذ قبل السيستم</span><strong>{displayNumber(row.historical_before_system)} م</strong></div>
            </div>
          </article>
        </section>

        <section className="project-record-grid project-record-grid--text">
          <article className="project-record-card">
            <header><Coins size={18} /><div><strong>الموقف المالي</strong><small>آخر موقف مسجل</small></div></header>
            <p className="project-record-long-text">{row.financial_status || 'لا يوجد موقف مالي مسجل.'}</p>
          </article>
          <article className="project-record-card">
            <header><FileText size={18} /><div><strong>الملاحظات</strong><small>ملاحظات متابعة المشروع</small></div></header>
            <p className="project-record-long-text">{row.notes || 'لا توجد ملاحظات مسجلة.'}</p>
          </article>
        </section>

        <section className="project-record-card project-record-attachments" id="attachments">
          <header>
            <Paperclip size={18} />
            <div><strong>مرفقات المشروع</strong><small>{attachments.length ? `${attachments.length} مرفق محفوظ` : 'لا توجد مرفقات'}</small></div>
          </header>

          {attachments.length ? (
            <div className="project-record-attachment-grid">
              {attachments.map((item) => {
                const isPdf = item.mime_type === 'application/pdf'
                const isImage = item.mime_type?.startsWith('image/')
                const preview = item.preview_url || (isImage ? item.url : null)
                return (
                  <article className="project-record-attachment" key={item.id}>
                    <div className="project-record-attachment__preview">
                      {preview ? (
                        <img src={preview} crossOrigin="anonymous" alt={isPdf ? `معاينة الصفحة الأولى من ${item.file_name}` : item.file_name} />
                      ) : (
                        <span>{isPdf ? <FileText size={34} /> : isImage ? <FileImage size={34} /> : attachmentType(item.mime_type) === 'Excel' ? <FileSpreadsheet size={34} /> : <File size={34} />}</span>
                      )}
                      {isPdf ? <b>PDF · الصفحة الأولى</b> : null}
                    </div>
                    <div className="project-record-attachment__info">
                      <strong>{item.file_name}</strong>
                      <small>{attachmentType(item.mime_type)} · {fileSize(item.file_size)}</small>
                      <div className="project-record-attachment__actions" data-html2canvas-ignore="true">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer">
                            فتح المرفق <ExternalLink size={13} />
                          </a>
                        ) : null}
                        {permissions.canManageProjectProgress ? (
                          <button
                            type="button"
                            className="project-record-attachment__delete"
                            onClick={() => removeAttachment(item)}
                            disabled={deleteAttachmentMutation.isPending && deleteAttachmentMutation.variables === item.id}
                          >
                            <Trash2 size={13} />
                            {deleteAttachmentMutation.isPending && deleteAttachmentMutation.variables === item.id ? '...' : 'مسح'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="project-record-attachments-empty"><Paperclip size={20} /> لا توجد ملفات مرفوعة على هذه المتابعة.</div>
          )}
        </section>

        <footer className="project-record-footer">
          <span>STC Operations Platform · Project Follow-up File</span>
          <strong>{row.project || ''}</strong>
        </footer>
      </div>
    </div>
  )
}
