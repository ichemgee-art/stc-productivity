import writeExcelFile from 'write-excel-file/browser'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const safeName = (value) => String(value || 'export').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)

const BRAND_LOGO_PATH = '/stc-logo-hq.jpg'
let brandLogoPngPromise

const getBrandLogoBlob = async () => {
  if (!brandLogoPngPromise) {
    brandLogoPngPromise = fetch(BRAND_LOGO_PATH)
      .then((response) => {
        if (!response.ok) throw new Error('تعذر تحميل لوجو STC')
        return response.blob()
      })
      .catch(() => null)
  }
  return brandLogoPngPromise
}

const addLogoToExcelSheet = (sheet, logoBlob) => {
  if (!logoBlob) return sheet
  const columnCount = Math.max(1, sheet?.columns?.length || 1)
  return {
    ...sheet,
    images: [
      ...(sheet.images || []),
      {
        content: logoBlob,
        contentType: 'image/jpeg',
        width: 132,
        height: 50,
        dpi: 96,
        anchor: { row: 1, column: columnCount },
        offsetX: 4,
        offsetY: 3,
        title: 'STC',
        description: 'Specialized Trading & Construction',
      },
    ],
  }
}

const EXCEL_COLORS = {
  navy: '#253A55',
  gold: '#F3B820',
  white: '#FFFFFF',
  text: '#253A55',
  muted: '#6F7D8F',
  border: '#D8DEE6',
  soft: '#F6F8FA',
  softGold: '#FFF7DC',
  green: '#1F8A5B',
  greenSoft: '#EAF7F0',
  red: '#D64545',
  redSoft: '#FDECEC',
  amber: '#A26A00',
  amberSoft: '#FFF4CC',
}

const excelBorder = {
  borderColor: EXCEL_COLORS.border,
  borderStyle: 'thin',
}

const titleCell = (value, span) => ({
  value,
  columnSpan: Math.max(1, span),
  backgroundColor: EXCEL_COLORS.navy,
  textColor: EXCEL_COLORS.white,
  fontWeight: 'bold',
  fontSize: 18,
  align: 'right',
  alignVertical: 'center',
  height: 34,
  wrap: true,
  ...excelBorder,
})

const subtitleCell = (value, span) => ({
  value,
  columnSpan: Math.max(1, span),
  backgroundColor: EXCEL_COLORS.softGold,
  textColor: EXCEL_COLORS.navy,
  fontWeight: 'bold',
  fontSize: 10,
  align: 'right',
  alignVertical: 'center',
  height: 23,
  wrap: true,
  ...excelBorder,
})

const headerCell = (value) => ({
  value,
  backgroundColor: EXCEL_COLORS.navy,
  textColor: EXCEL_COLORS.white,
  fontWeight: 'bold',
  align: 'center',
  alignVertical: 'center',
  height: 28,
  wrap: true,
  ...excelBorder,
})

const isMoneyHeader = (key) => /قيمة|مستحق|الإجمالي|سعر|تكلفة|ايراد|إيراد|revenue|amount|price|cost/i.test(String(key))
const isPercentHeader = (key) => /%|نسبة|percent|rate/i.test(String(key))
const isNumericColumn = (rows, key) => {
  const values = rows.slice(0, 30).map((row) => row?.[key]).filter((value) => value !== '' && value != null)
  return values.length > 0 && values.every((value) => typeof value === 'number' && Number.isFinite(value))
}

const cellFormat = (key, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (isPercentHeader(key)) return '#,##0.0"%"'
  if (isMoneyHeader(key)) return '#,##0.00'
  return Number.isInteger(value) ? '#,##0' : '#,##0.00'
}

const bodyCell = (key, value, rowIndex) => {
  const base = {
    value: value == null ? '' : value,
    backgroundColor: rowIndex % 2 ? EXCEL_COLORS.soft : EXCEL_COLORS.white,
    textColor: EXCEL_COLORS.text,
    align: typeof value === 'number' ? 'center' : 'right',
    alignVertical: 'center',
    wrap: true,
    ...excelBorder,
  }

  const format = cellFormat(key, value)
  if (format) base.format = format

  const normalized = String(value ?? '').trim()
  if (/^(لم تتم|غير مراجع|غير مراجعة)$/i.test(normalized)) {
    base.backgroundColor = EXCEL_COLORS.amberSoft
    base.textColor = EXCEL_COLORS.amber
    base.fontWeight = 'bold'
  } else if (/^(تمت المراجعة|مراجع|مراجعة مكتملة)$/i.test(normalized)) {
    base.backgroundColor = EXCEL_COLORS.greenSoft
    base.textColor = EXCEL_COLORS.green
    base.fontWeight = 'bold'
  } else if (/^(غياب|غائب|absent)$/i.test(normalized)) {
    base.backgroundColor = EXCEL_COLORS.redSoft
    base.textColor = EXCEL_COLORS.red
    base.fontWeight = 'bold'
  } else if (/^(حاضر|present)$/i.test(normalized)) {
    base.backgroundColor = EXCEL_COLORS.greenSoft
    base.textColor = EXCEL_COLORS.green
    base.fontWeight = 'bold'
  }

  if (/سعر/.test(String(key)) && Number(value) === 0) {
    base.backgroundColor = EXCEL_COLORS.redSoft
    base.textColor = EXCEL_COLORS.red
    base.fontWeight = 'bold'
  }

  if (/التغير|فرق|delta|change/i.test(String(key)) && typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0) {
      base.backgroundColor = EXCEL_COLORS.greenSoft
      base.textColor = EXCEL_COLORS.green
      base.fontWeight = 'bold'
    } else if (value < 0) {
      base.backgroundColor = EXCEL_COLORS.redSoft
      base.textColor = EXCEL_COLORS.red
      base.fontWeight = 'bold'
    }
  }

  return base
}

const estimateColumnWidth = (key, rows) => {
  const values = rows.slice(0, 120).map((row) => String(row?.[key] ?? ''))
  const max = Math.max(String(key).length, ...values.map((value) => value.length))
  const textHeavy = /اسم|مشروع|قطاع|مهندس|فني|مساعد|عامل|ملاحظ|note|project|section/i.test(String(key))
  const cap = textHeavy ? 34 : 22
  return Math.min(cap, Math.max(11, Math.ceil(max * 0.88) + 3))
}

const uniqueSheetNames = (sheets) => {
  const used = new Set()
  return (sheets || []).map((sheet, index) => {
    const base = safeName(sheet?.name || `Sheet ${index + 1}`).slice(0, 31) || `Sheet ${index + 1}`
    let name = base
    let counter = 2
    while (used.has(name)) {
      const suffix = ` ${counter}`
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`
      counter += 1
    }
    used.add(name)
    return name
  })
}

const buildStyledTableSheet = ({ name, rows = [], subtitle = '', dashboardName = '' }, resolvedName) => {
  const keys = Object.keys(rows[0] || {})
  const width = Math.max(keys.length, 1)
  const title = name || resolvedName
  const dataStartRow = 5

  if (!keys.length) {
    return {
      sheet: resolvedName,
      data: [
        [titleCell(title, 1)],
        [subtitleCell(subtitle || 'STC Productivity System', 1)],
        [{ value: 'لا توجد بيانات', textColor: EXCEL_COLORS.muted, align: 'center', ...excelBorder }],
      ],
      columns: [{ width: 26 }],
      rightToLeft: true,
      showGridLines: false,
      stickyRowsCount: 2,
      zoomScale: 1,
    }
  }

  const navigation = dashboardName
    ? [{
        value: `=HYPERLINK("#'${dashboardName.replaceAll("'", "''")}'!A1","← الرجوع إلى Dashboard")`,
        type: 'Formula',
        textColor: EXCEL_COLORS.navy,
        fontWeight: 'bold',
        backgroundColor: EXCEL_COLORS.softGold,
        align: 'right',
        ...excelBorder,
      }, ...Array.from({ length: width - 1 }, () => null)]
    : Array.from({ length: width }, () => null)

  const header = keys.map(headerCell)
  const body = rows.map((row, rowIndex) => keys.map((key) => bodyCell(key, row[key], rowIndex)))

  const numericColumns = keys.map((key, index) => ({ key, index })).filter(({ key }) => isNumericColumn(rows, key))
  const totals = keys.map((key, index) => {
    if (index === 0) {
      return {
        value: 'الإجمالي',
        backgroundColor: EXCEL_COLORS.softGold,
        textColor: EXCEL_COLORS.navy,
        fontWeight: 'bold',
        align: 'center',
        ...excelBorder,
      }
    }
    if (!numericColumns.some((item) => item.index === index)) {
      return {
        value: '',
        backgroundColor: EXCEL_COLORS.softGold,
        ...excelBorder,
      }
    }
    const columnLetter = (() => {
      let n = index + 1
      let out = ''
      while (n > 0) {
        n -= 1
        out = String.fromCharCode(65 + (n % 26)) + out
        n = Math.floor(n / 26)
      }
      return out
    })()
    const endRow = dataStartRow + rows.length - 1
    return {
      value: `=SUM(${columnLetter}${dataStartRow}:${columnLetter}${endRow})`,
      type: 'Formula',
      format: isPercentHeader(key) ? '#,##0.0"%"' : isMoneyHeader(key) ? '#,##0.00' : '#,##0.00',
      backgroundColor: EXCEL_COLORS.softGold,
      textColor: EXCEL_COLORS.navy,
      fontWeight: 'bold',
      align: 'center',
      ...excelBorder,
    }
  })

  return {
    sheet: resolvedName,
    data: [
      [titleCell(title, width), ...Array.from({ length: width - 1 }, () => null)],
      [subtitleCell(subtitle || 'STC Productivity System', width), ...Array.from({ length: width - 1 }, () => null)],
      navigation,
      header,
      ...body,
      totals,
    ],
    columns: keys.map((key) => ({ width: estimateColumnWidth(key, rows) })),
    rightToLeft: true,
    showGridLines: false,
    stickyRowsCount: 4,
    stickyColumnsCount: keys.length >= 8 ? 2 : 1,
    orientation: keys.length >= 7 ? 'landscape' : 'portrait',
    zoomScale: keys.length >= 10 ? 0.85 : 0.95,
  }
}

const buildDashboardSheet = ({ title, subtitle, kpis = [], sheets = [], highlights = [] }, dashboardName, sheetNames) => {
  const columns = 6
  const safeKpis = [...kpis].slice(0, 6)
  while (safeKpis.length < 6) safeKpis.push({ label: '—', value: '—' })

  const navCells = sheetNames.slice(1, 7).map((sheetName) => ({
    value: `=HYPERLINK("#'${sheetName.replaceAll("'", "''")}'!A1","${sheetName}")`,
    type: 'Formula',
    backgroundColor: EXCEL_COLORS.softGold,
    textColor: EXCEL_COLORS.navy,
    fontWeight: 'bold',
    align: 'center',
    alignVertical: 'center',
    wrap: true,
    ...excelBorder,
  }))
  while (navCells.length < columns) navCells.push(null)

  const highlightRows = (highlights || []).slice(0, 12).map((item, index) => [
    {
      value: item?.title || item?.label || `ملاحظة ${index + 1}`,
      backgroundColor: index % 2 ? EXCEL_COLORS.soft : EXCEL_COLORS.white,
      textColor: EXCEL_COLORS.navy,
      fontWeight: 'bold',
      wrap: true,
      ...excelBorder,
    },
    {
      value: item?.value ?? item?.text ?? '—',
      columnSpan: 5,
      backgroundColor: index % 2 ? EXCEL_COLORS.soft : EXCEL_COLORS.white,
      textColor: item?.tone === 'danger' ? EXCEL_COLORS.red : item?.tone === 'warning' ? EXCEL_COLORS.amber : EXCEL_COLORS.text,
      wrap: true,
      ...excelBorder,
    },
    ...Array.from({ length: 4 }, () => null),
  ])

  return {
    sheet: dashboardName,
    data: [
      [titleCell(title || 'STC Productivity Report', columns), ...Array.from({ length: columns - 1 }, () => null)],
      [subtitleCell(subtitle || 'Executive Excel Report', columns), ...Array.from({ length: columns - 1 }, () => null)],
      Array.from({ length: columns }, () => null),
      ...safeKpis.map((item) => [{
        value: item.label || '—',
        backgroundColor: EXCEL_COLORS.navy,
        textColor: EXCEL_COLORS.gold,
        fontWeight: 'bold',
        align: 'center',
        wrap: true,
        ...excelBorder,
      }]).reduce((rows, cell, index) => {
        if (index < 3) {
          if (!rows[0]) rows[0] = []
          rows[0].push(cell[0], {
            value: safeKpis[index].value ?? '—',
            backgroundColor: EXCEL_COLORS.white,
            textColor: EXCEL_COLORS.navy,
            fontWeight: 'bold',
            fontSize: 13,
            align: 'center',
            wrap: true,
            ...excelBorder,
          })
        } else {
          if (!rows[1]) rows[1] = []
          rows[1].push(cell[0], {
            value: safeKpis[index].value ?? '—',
            backgroundColor: EXCEL_COLORS.white,
            textColor: EXCEL_COLORS.navy,
            fontWeight: 'bold',
            fontSize: 13,
            align: 'center',
            wrap: true,
            ...excelBorder,
          })
        }
        return rows
      }, []),
      Array.from({ length: columns }, () => null),
      [{
        value: 'التنقل داخل الملف',
        columnSpan: columns,
        backgroundColor: EXCEL_COLORS.navy,
        textColor: EXCEL_COLORS.white,
        fontWeight: 'bold',
        align: 'right',
        ...excelBorder,
      }, ...Array.from({ length: columns - 1 }, () => null)],
      navCells,
      Array.from({ length: columns }, () => null),
      [{
        value: 'ملخص تشغيلي',
        columnSpan: columns,
        backgroundColor: EXCEL_COLORS.navy,
        textColor: EXCEL_COLORS.white,
        fontWeight: 'bold',
        align: 'right',
        ...excelBorder,
      }, ...Array.from({ length: columns - 1 }, () => null)],
      ...highlightRows,
    ],
    columns: [
      { width: 22 }, { width: 18 }, { width: 22 },
      { width: 18 }, { width: 22 }, { width: 18 },
    ],
    rightToLeft: true,
    showGridLines: false,
    stickyRowsCount: 2,
    orientation: 'landscape',
    zoomScale: 0.95,
  }
}

export async function exportExcel({ filename, sheets }) {
  const sourceSheets = (sheets || []).filter((sheet) => Array.isArray(sheet?.rows))
  const names = uniqueSheetNames(sourceSheets)
  const workbookSheets = sourceSheets.map((sheet, index) => buildStyledTableSheet({
    ...sheet,
    subtitle: sheet.subtitle || 'STC Productivity System · تصدير البيانات',
  }, names[index]))

  const output = workbookSheets.length
    ? workbookSheets
    : [buildStyledTableSheet({ name: 'البيانات', rows: [] }, 'Sheet1')]

  const logoBlob = await getBrandLogoBlob()
  const brandedOutput = output.map((sheet) => addLogoToExcelSheet(sheet, logoBlob))

  await writeExcelFile(brandedOutput, {
    fontFamily: 'Arial',
    fontSize: 10,
  }).toFile(`${safeName(filename)}.xlsx`)
}

export async function exportExecutiveExcel({
  filename,
  title = 'STC Productivity Report',
  subtitle = 'Executive Excel Report',
  kpis = [],
  sheets = [],
  highlights = [],
}) {
  const sourceSheets = (sheets || []).filter((sheet) => Array.isArray(sheet?.rows))
  const dashboardName = 'Dashboard'
  const names = [dashboardName, ...uniqueSheetNames(sourceSheets)]
  const dashboard = buildDashboardSheet({ title, subtitle, kpis, sheets: sourceSheets, highlights }, dashboardName, names)
  const tableSheets = sourceSheets.map((sheet, index) => buildStyledTableSheet({
    ...sheet,
    subtitle: sheet.subtitle || subtitle,
    dashboardName,
  }, names[index + 1]))

  const logoBlob = await getBrandLogoBlob()
  const brandedSheets = [dashboard, ...tableSheets].map((sheet) => addLogoToExcelSheet(sheet, logoBlob))

  await writeExcelFile(brandedSheets, {
    fontFamily: 'Arial',
    fontSize: 10,
  }).toFile(`${safeName(filename)}.xlsx`)
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const displayValue = (value) => {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString('en-US')
      : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return String(value)
}

export async function exportTablePdf({ filename, sheets }) {
  const printableSheets = (sheets || []).filter((sheet) => Array.isArray(sheet?.rows))
  if (!printableSheets.length) throw new Error('لا توجد بيانات جدول جاهزة للتصدير')

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم جرّب مرة أخرى.')
  }

  const maxColumns = printableSheets.reduce((max, sheet) => {
    const count = Object.keys(sheet.rows?.[0] || {}).length
    return Math.max(max, count)
  }, 0)

  const pageSize = maxColumns >= 9 ? 'A3 landscape' : 'A4 landscape'
  const fontSize = maxColumns >= 14 ? 6.3 : maxColumns >= 11 ? 7 : maxColumns >= 8 ? 7.8 : 8.8
  const cellPadding = maxColumns >= 12 ? '3.3px 2.5px' : '4px 3px'
  const generatedAt = new Date().toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const totalRows = printableSheets.reduce((sum, sheet) => sum + (sheet.rows?.length || 0), 0)
  const reportTitle = printableSheets.length === 1
    ? (printableSheets[0].name || safeName(filename))
    : safeName(filename)

  const sections = printableSheets.map((sheet, sheetIndex) => {
    const rows = sheet.rows || []
    const keys = Object.keys(rows[0] || {})
    const table = keys.length
      ? `
        <div class="table-shell">
          <table>
            <thead>
              <tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((row, rowIndex) => `
                <tr>
                  ${keys.map((key) => `<td>${escapeHtml(displayValue(row[key]))}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="empty">لا توجد بيانات</div>'

    return `
      <section class="sheet ${sheetIndex > 0 ? 'new-page' : ''}">
        <header class="executive-header">
          <div class="executive-header__copy">
            <span class="eyebrow">STC · ENGINEERING OPERATIONS REPORT</span>
            <h1>${escapeHtml(sheet.name || reportTitle)}</h1>
            <p>تقرير تشغيلي كامل — جميع الصفوف والأعمدة مدرجة داخل المستند.</p>
          </div>
          <div class="executive-logo-wrap">
            <img class="executive-logo" src="${escapeHtml(brandLogoUrl)}" alt="STC Specialized Trading & Construction" />
          </div>
        </header>

        <section class="report-meta-grid">
          <article>
            <span>عدد السجلات</span>
            <strong>${rows.length.toLocaleString('en-US')}</strong>
          </article>
          <article>
            <span>عدد الأعمدة</span>
            <strong>${keys.length.toLocaleString('en-US')}</strong>
          </article>
          <article>
            <span>تاريخ التصدير</span>
            <strong class="meta-date">${escapeHtml(generatedAt)}</strong>
          </article>
        </section>

        <div class="section-title">
          <div>
            <span>FULL DATA TABLE</span>
            <h2>${escapeHtml(sheet.name || 'البيانات')}</h2>
          </div>
          <small>${rows.length.toLocaleString('ar-EG')} سجل</small>
        </div>

        ${table}
      </section>
    `
  }).join('')

  const title = safeName(filename)
  const brandLogoUrl = `${window.location.origin}${BRAND_LOGO_PATH}`
  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 8mm 7mm 10mm;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #253A55;
      font-family: Tahoma, Arial, "Segoe UI", sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      direction: rtl;
      font-variant-numeric: tabular-nums;
    }

    .print-root {
      width: 100%;
      background: #FFFFFF;
    }

    .sheet {
      width: 100%;
    }

    .new-page {
      break-before: page;
      page-break-before: always;
    }

    .executive-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      min-height: 78px;
      margin-bottom: 8px;
      padding: 14px 18px;
      border-radius: 8px;
      background: #253A55 !important;
      color: #FFFFFF !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .executive-header__copy {
      display: grid;
      gap: 3px;
    }

    .executive-header .eyebrow {
      color: #F3B820 !important;
      font-size: 6.8px;
      font-weight: 800;
      letter-spacing: .8px;
    }

    .executive-header h1 {
      margin: 0;
      color: #FFFFFF !important;
      font-size: 17px;
      line-height: 1.45;
    }

    .executive-header p {
      margin: 0;
      color: rgba(255,255,255,.76) !important;
      font-size: 7px;
    }

    .executive-logo-wrap {
      width: 132px;
      flex: 0 0 132px;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
      padding: 4px;
      border-radius: 8px;
      background: #FFFFFF;
    }

    .executive-logo {
      display: block;
      width: 124px;
      height: auto;
      object-fit: contain;
    }

    .report-meta-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
      margin-bottom: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .report-meta-grid article {
      display: grid;
      gap: 2px;
      min-height: 44px;
      padding: 8px 10px;
      border: 1px solid #D8DEE6;
      border-radius: 7px;
      background: #FFFFFF;
    }

    .report-meta-grid span {
      color: #7B8797;
      font-size: 6.5px;
    }

    .report-meta-grid strong {
      color: #253A55;
      font-size: 12px;
    }

    .report-meta-grid .meta-date {
      font-size: 8px;
      line-height: 1.5;
    }

    .section-title {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 10px;
      margin: 0 0 5px;
      padding: 0 2px 5px;
      border-bottom: 2px solid #253A55;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .section-title > div {
      display: grid;
      gap: 1px;
    }

    .section-title span {
      color: #B07E00;
      font-size: 5.8px;
      font-weight: 800;
      letter-spacing: .6px;
    }

    .section-title h2 {
      margin: 0;
      color: #253A55;
      font-size: 11px;
    }

    .section-title small {
      color: #66758A;
      font-size: 6.5px;
    }

    .table-shell {
      width: 100%;
      overflow: visible;
      border: 1px solid #D8DEE6;
      border-radius: 6px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      direction: rtl;
      font-size: ${fontSize}px;
    }

    thead {
      display: table-header-group;
    }

    tbody {
      display: table-row-group;
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    th {
      padding: ${cellPadding};
      border: 1px solid #253A55;
      background: #253A55 !important;
      color: #FFFFFF !important;
      font-weight: 800;
      line-height: 1.4;
      text-align: center;
      vertical-align: middle;
      word-break: normal;
      overflow-wrap: anywhere;
      white-space: normal;
    }

    td {
      padding: ${cellPadding};
      border: 1px solid #D8DEE6;
      background: #FFFFFF !important;
      color: #253A55 !important;
      line-height: 1.45;
      text-align: center;
      vertical-align: middle;
      word-break: normal;
      overflow-wrap: anywhere;
      white-space: normal;
    }

    tbody tr:nth-child(even) td {
      background: #F7F8FA !important;
    }

    .empty {
      padding: 28px;
      border: 1px dashed #B8C1CD;
      border-radius: 7px;
      text-align: center;
      color: #66758A;
      font-size: 10px;
    }

    .document-footer {
      margin-top: 6px;
      padding-top: 5px;
      border-top: 1px solid #D8DEE6;
      color: #7B8797;
      font-size: 5.8px;
      text-align: center;
    }

    @media screen {
      body {
        max-width: 1500px;
        margin: 0 auto;
        padding: 18px;
        background: #EEF1F4;
      }

      .print-root {
        padding: 14px;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(37,58,85,.14);
      }
    }

    @media print {
      html, body, .print-root {
        width: 100% !important;
        max-width: none !important;
      }

      body {
        background: #FFFFFF !important;
      }

      .print-root {
        padding: 0 !important;
      }

      .executive-header,
      .report-meta-grid,
      .section-title {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      table {
        width: 100% !important;
      }

      thead {
        display: table-header-group !important;
      }

      tr, td, th {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      .new-page {
        break-before: page !important;
        page-break-before: always !important;
      }
    }
  </style>
</head>
<body>
  <main class="print-root">
    ${sections}
    <footer class="document-footer">
      STC Productivity System · ${totalRows.toLocaleString('ar-EG')} سجل إجمالي · ${escapeHtml(generatedAt)}
    </footer>
  </main>

  <script>
    (() => {
      const runPrint = async () => {
        try {
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
        } catch (_) {}
        window.focus();
        window.print();
      };

      window.addEventListener('load', () => setTimeout(runPrint, 150));
      window.addEventListener('afterprint', () => setTimeout(() => window.close(), 200));
    })();
  <\/script>
</body>
</html>`)
  printWindow.document.close()
}


export async function exportElementPdf(element, filename) {
  if (!element) throw new Error('لا يوجد محتوى جاهز للتصدير')
  const canvas = await html2canvas(element, {
    scale: 1.7,
    useCORS: true,
    backgroundColor: '#ffffff',
    windowWidth: Math.max(element.scrollWidth, element.clientWidth),
    windowHeight: Math.max(element.scrollHeight, element.clientHeight),
    onclone: (clonedDocument) => {
      clonedDocument.querySelectorAll('.data-table-wrap, .compact-table, .productivity-scroll, .person-operation-notes__list').forEach((node) => {
        node.style.maxHeight = 'none'
        node.style.height = 'auto'
        node.style.overflow = 'visible'
      })
      clonedDocument.querySelectorAll('.data-table th').forEach((node) => {
        node.style.position = 'static'
      })
    },
  })

  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 7
  const usableWidth = pageWidth - margin * 2
  const imageHeight = (canvas.height * usableWidth) / canvas.width
  const image = canvas.toDataURL('image/png', 0.96)

  if (imageHeight <= pageHeight - margin * 2) {
    pdf.addImage(image, 'PNG', margin, margin, usableWidth, imageHeight)
  } else {
    const pagePixelHeight = Math.floor((canvas.width * (pageHeight - margin * 2)) / usableWidth)
    let offsetY = 0
    let page = 0

    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - offsetY)
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceHeight
      slice.getContext('2d').drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      const sliceImage = slice.toDataURL('image/png', 0.96)
      const sliceMmHeight = (sliceHeight * usableWidth) / canvas.width
      if (page > 0) pdf.addPage()
      pdf.addImage(sliceImage, 'PNG', margin, margin, usableWidth, sliceMmHeight)
      offsetY += sliceHeight
      page += 1
    }
  }

  pdf.save(`${safeName(filename)}.pdf`)
}
