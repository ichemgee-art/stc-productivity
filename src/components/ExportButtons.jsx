import { useState } from 'react'
import { BarChart3, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { exportElementPdf, exportExcel, exportExecutiveExcel, exportTablePdf } from '../lib/exporters'
import { useFeedback } from '../context/FeedbackContext'

export default function ExportButtons({ filename, excelSheets, executiveExcel, pdfTarget, compact = false, hideQuickExcel = false, showSuccess = false, preferElementPdf = false }) {
  const [busy, setBusy] = useState('')
  const feedback = useFeedback()

  const excel = async () => {
    setBusy('excel')
    try {
      await exportExcel({ filename, sheets: excelSheets })
      if (showSuccess) feedback.success('تم تصدير Excel', 'تم تجهيز ملف Excel المنسق بنجاح.', 2800)
    } catch (error) {
      feedback.error('تعذر تصدير Excel', error.message || 'حدث خطأ أثناء إنشاء الملف')
    } finally {
      setBusy('')
    }
  }

  const executive = async () => {
    if (!executiveExcel) return
    setBusy('executive')
    try {
      await exportExecutiveExcel({
        filename: executiveExcel.filename || `${filename}-executive`,
        title: executiveExcel.title,
        subtitle: executiveExcel.subtitle,
        kpis: executiveExcel.kpis,
        sheets: executiveExcel.sheets || excelSheets,
        highlights: executiveExcel.highlights,
      })
    } catch (error) {
      feedback.error('تعذر إنشاء تقرير Excel', error.message || 'حدث خطأ أثناء إنشاء التقرير الكامل')
    } finally {
      setBusy('')
    }
  }

  const pdf = async () => {
    setBusy('pdf')
    try {
      const element = typeof pdfTarget === 'function' ? pdfTarget() : pdfTarget?.current || pdfTarget
      const hasTabularData = Array.isArray(excelSheets) && excelSheets.some((sheet) => Array.isArray(sheet?.rows))
      if (preferElementPdf && element) {
        await exportElementPdf(element, filename)
      } else if (hasTabularData) {
        await exportTablePdf({ filename, sheets: excelSheets })
      } else {
        await exportElementPdf(element, filename)
      }
      if (showSuccess) feedback.success('تم تجهيز PDF', 'تم فتح نسخة الطباعة الاحترافية للتقرير.', 2800)
    } catch (error) {
      feedback.error('تعذر تصدير PDF', error.message || 'حدث خطأ أثناء إنشاء الملف')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className={`export-actions ${compact ? 'compact' : ''}`} data-html2canvas-ignore="true">
      <span className="export-label"><Download size={14} /> تصدير النتائج</span>
      {!hideQuickExcel ? <button className="btn btn-export excel" type="button" onClick={excel} disabled={Boolean(busy)}><FileSpreadsheet size={15} />{busy === 'excel' ? '...' : 'Excel'}</button> : null}
      {executiveExcel ? <button className="btn btn-export executive-excel" type="button" onClick={executive} disabled={Boolean(busy)}><BarChart3 size={15} />{busy === 'executive' ? '...' : 'تقرير Excel'}</button> : null}
      <button className="btn btn-export pdf" type="button" onClick={pdf} disabled={Boolean(busy)}><FileText size={15} />{busy === 'pdf' ? '...' : 'PDF'}</button>
    </div>
  )
}
