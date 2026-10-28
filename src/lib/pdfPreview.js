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

export async function renderPdfFirstPage(file) {
  const pdfjs = await loadPdfJs()
  const bytes = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data: bytes }).promise

  try {
    const page = await document.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const targetWidth = 1200
    const scale = Math.min(2, Math.max(1, targetWidth / baseViewport.width))
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    const context = canvas.getContext('2d', { alpha: false })
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: context, viewport }).promise

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) throw new Error('تعذر إنشاء صورة معاينة للـ PDF')
    return blob
  } finally {
    await document.destroy()
  }
}
