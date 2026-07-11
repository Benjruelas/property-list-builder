import { buildReportDocumentHtml, REPORT_PDF_VIEWPORT } from './publicDocumentHtml.js'
import { htmlToPdfBuffer } from './htmlToPdf.js'
import { leadDisplayName } from './publicReportPayload.js'

/**
 * Prefer annotated/display thumbnails so PDFs match the public grid and stay fast.
 */
export function resolveReportPhotoImageKey(photo) {
  if (!photo) return null
  return (
    photo.annotatedThumbnailKey
    || photo.thumbnailKey
    || photo.annotatedKey
    || photo.key
    || null
  )
}

function detectImageMime(buf) {
  if (!buf || buf.length < 4) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp'
  return 'image/jpeg'
}

function bufferToDataUri(buf) {
  const mime = detectImageMime(buf)
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Fetch image buffers needed by the report up front, with bounded concurrency.
 * Uses thumbnails when available (same assets the HTML page shows in the grid).
 */
async function prefetchPhotoDataUris({ report, photosById, getImageBuffer, concurrency = 8 }) {
  const jobs = []
  const seen = new Set()
  for (const section of report?.sections || []) {
    for (const photoId of section.photoIds || []) {
      if (seen.has(photoId)) continue
      seen.add(photoId)
      const photo = photosById[photoId]
      const imgKey = resolveReportPhotoImageKey(photo)
      if (!imgKey) continue
      jobs.push({ photoId, imgKey, caption: photo.caption || photo.note || '' })
    }
  }

  const out = []
  let next = 0
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]
      try {
        const buf = await getImageBuffer(job.imgKey)
        if (!buf?.length) continue
        out.push({
          id: job.photoId,
          caption: job.caption,
          dataUri: bufferToDataUri(buf),
        })
      } catch (e) {
        console.warn('skip photo in pdf', job.imgKey, e.message)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(jobs.length, 1)) }, worker))
  return out
}

/**
 * Build a photo-report PDF that matches the public `/r/{token}` HTML page.
 * @param {{
 *   report: object,
 *   lead: object,
 *   branding: object,
 *   message?: string,
 *   getImageBuffer: (key: string) => Promise<Buffer>
 * }} opts
 */
export async function buildReportPdfBuffer({
  report,
  lead,
  branding,
  message = '',
  getImageBuffer,
}) {
  const photosById = Object.fromEntries((lead?.photos || []).map((p) => [p.id, p]))
  const photos = getImageBuffer
    ? await prefetchPhotoDataUris({ report, photosById, getImageBuffer })
    : []

  const html = buildReportDocumentHtml({
    report,
    lead: {
      name: leadDisplayName(lead),
      address: lead?.address || '',
    },
    branding: branding
      ? {
          businessName: branding.businessName,
          logoBase64: branding.logoBase64,
          senderName: branding.senderName,
          senderEmail: branding.senderEmail || report.ownerEmail || '',
        }
      : null,
    message,
    photos,
  })

  return htmlToPdfBuffer(html, {
    waitUntil: 'networkidle0',
    viewport: REPORT_PDF_VIEWPORT,
  })
}

export function reportPdfStorageKey(ownerId, reportId) {
  return `report-pdfs/${ownerId}/${reportId}.pdf`
}

export function safePdfFilename(title) {
  const base = String(title || 'report').replace(/[^\w\s-]/g, '').trim() || 'report'
  return `${base.slice(0, 80)}.pdf`
}

export { leadDisplayName }
