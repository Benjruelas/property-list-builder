import { createTemplate, uploadFormPdf, updateTemplate } from './forms'

async function readFileAsArrayBuffer(file) {
  return await file.arrayBuffer()
}

async function getPdfPageCount(arrayBuffer) {
  const mod = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  mod.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await mod.getDocument({ data: arrayBuffer.slice(0) }).promise
  const n = doc.numPages
  try { doc.destroy() } catch { /* ignore */ }
  return n
}

/**
 * Create a form template from a PDF file (shared by FormsPanel and lead form picker).
 */
export async function createFormFromPdfFile(getToken, file) {
  if (!file) throw new Error('No file selected')
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('PDF is too large. Please use a file under 4 MB.')
  }
  const buf = await readFileAsArrayBuffer(file)
  const pageCount = await getPdfPageCount(buf)
  const baseName = file.name.replace(/\.pdf$/i, '').slice(0, 80) || 'Untitled form'
  const created = await createTemplate(getToken, {
    name: baseName,
    fields: [],
    pageCount,
  })
  const { key, url } = await uploadFormPdf(getToken, {
    templateId: created.id,
    file: buf,
  })
  const updated = await updateTemplate(getToken, created.id, {
    originalPdfKey: key,
    originalPdfUrl: url,
    pageCount,
  })
  return updated
}

export function pickFormPdfFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.onchange = () => {
      resolve(input.files?.[0] || null)
    }
    input.click()
  })
}
