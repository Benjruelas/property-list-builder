/**
 * Web worker: flattens form field values onto a PDF using pdf-lib.
 *
 * Message in:
 *   {
 *     type: 'flatten',
 *     pdfBuffer: ArrayBuffer,
 *     fields: Array<{ id, type, page, x, y, width, height }>,   // x/y/w/h are 0..1
 *     values: Record<string, string | boolean>,                   // signature values are data URLs
 *   }
 *
 * Message out (success):  { type: 'done', bytes: Uint8Array }
 * Message out (error):    { type: 'error', message: string }
 *
 * Keeps pdf-lib out of the main bundle AND off the main thread.
 */

function pctToPdfPoints(field, pageSize) {
  const W = pageSize.width
  const H = pageSize.height
  const x = Math.max(0, Math.min(1, field.x)) * W
  const yTop = Math.max(0, Math.min(1, field.y)) * H
  const width = Math.max(0, Math.min(1, field.width)) * W
  const height = Math.max(0, Math.min(1, field.height)) * H
  return { x, y: H - yTop - height, width, height }
}

function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

self.onmessage = async (evt) => {
  const msg = evt.data || {}
  if (msg.type !== 'flatten') return
  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const srcBytes = new Uint8Array(msg.pdfBuffer)
    const pdfDoc = await PDFDocument.load(srcBytes)
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const pages = pdfDoc.getPages()

    for (const field of msg.fields || []) {
      const page = pages[field.page]
      if (!page) continue
      const raw = msg.values?.[field.id]
      const { width: pw, height: ph } = page.getSize()
      const rect = pctToPdfPoints(field, { width: pw, height: ph })

      if (field.type === 'text' || field.type === 'date') {
        const value = raw == null ? '' : String(raw)
        if (!value) continue
        const fontSize = Math.max(6, Math.min(14, rect.height * 0.7))
        page.drawText(value, {
          x: rect.x + 2,
          y: rect.y + (rect.height - fontSize) / 2 + 1,
          size: fontSize,
          font: helv,
          color: rgb(0, 0, 0),
          maxWidth: rect.width - 4,
        })
      } else if (field.type === 'checkbox') {
        if (raw) {
          const s = Math.min(rect.width, rect.height) * 0.9
          const cx = rect.x + (rect.width - s) / 2
          const cy = rect.y + (rect.height - s) / 2
          page.drawLine({
            start: { x: cx, y: cy + s * 0.4 },
            end: { x: cx + s * 0.4, y: cy },
            thickness: 1.5,
            color: rgb(0, 0, 0),
          })
          page.drawLine({
            start: { x: cx + s * 0.4, y: cy },
            end: { x: cx + s, y: cy + s },
            thickness: 1.5,
            color: rgb(0, 0, 0),
          })
        }
      } else if (field.type === 'signature') {
        if (typeof raw === 'string' && raw.startsWith('data:image/')) {
          const bytes = dataUrlToBytes(raw)
          let img
          if (raw.startsWith('data:image/jpeg') || raw.startsWith('data:image/jpg')) {
            img = await pdfDoc.embedJpg(bytes)
          } else {
            img = await pdfDoc.embedPng(bytes)
          }
          const imgDims = img.scaleToFit(rect.width, rect.height)
          const offsetX = rect.x + (rect.width - imgDims.width) / 2
          const offsetY = rect.y + (rect.height - imgDims.height) / 2
          page.drawImage(img, {
            x: offsetX,
            y: offsetY,
            width: imgDims.width,
            height: imgDims.height,
          })
        }
      }
    }

    const out = await pdfDoc.save({ useObjectStreams: true })
    self.postMessage({ type: 'done', bytes: out }, [out.buffer])
  } catch (e) {
    self.postMessage({ type: 'error', message: e?.message || 'Flatten failed' })
  }
}
