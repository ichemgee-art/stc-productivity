const PDFJS_VERSION = '4.10.38'
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`

let pdfJsPromise

const loadPdfJs = async () => {
  if (!pdfJsPromise) {
    const moduleUrl = `${PDFJS_BASE}/pdf.min.mjs`
    pdfJsPromise = import(/* @vite-ignore */ moduleUrl).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`
      return pdfjs
    })
  }
  return pdfJsPromise
}

const renderPageToJpeg = async (page, { targetWidth = 1200, maxScale = 3, quality = 0.9 } = {}) => {
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(maxScale, Math.max(1, targetWidth / baseViewport.width))
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  const context = canvas.getContext('2d', { alpha: false })
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  await page.render({ canvasContext: context, viewport }).promise

  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('تعذر إنشاء صورة من صفحة PDF')

  const result = {
    blob,
    dataUrl,
    width: canvas.width,
    height: canvas.height,
  }

  canvas.width = 1
  canvas.height = 1
  return result
}

export async function renderPdfFirstPage(file) {
  const pdfjs = await loadPdfJs()
  const bytes = await file.arrayBuffer()
  const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise

  try {
    const page = await pdfDocument.getPage(1)
    const rendered = await renderPageToJpeg(page, {
      targetWidth: 900,
      maxScale: 1.6,
      quality: 0.82,
    })
    return rendered.blob
  } finally {
    await pdfDocument.destroy()
  }
}

export async function renderPdfPagesFromUrl(url, {
  targetWidth = 2400,
  maxScale = 4,
  quality = 0.95,
  onPage,
} = {}) {
  if (!url) throw new Error('رابط ملف PDF غير متاح')

  const response = await fetch(url)
  if (!response.ok) throw new Error('تعذر تحميل ملف PDF المرفق')

  const pdfjs = await loadPdfJs()
  const bytes = await response.arrayBuffer()
  const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise
  const pages = []

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      const rendered = await renderPageToJpeg(page, { targetWidth, maxScale, quality })
      const pageData = {
        pageNumber,
        totalPages: pdfDocument.numPages,
        dataUrl: rendered.dataUrl,
        width: rendered.width,
        height: rendered.height,
      }
      if (onPage) await onPage(pageData)
      else pages.push(pageData)
    }
    return pages
  } finally {
    await pdfDocument.destroy()
  }
}
