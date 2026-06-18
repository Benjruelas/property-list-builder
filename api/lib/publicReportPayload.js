import { resolveSenderBranding } from './senderBranding.js'

export function leadDisplayName(lead) {
  const parts = [lead?.firstName, lead?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return (lead?.address || 'Property').trim()
}

export function allowedReportPhotoIds(report) {
  const ids = new Set()
  for (const sec of report?.sections || []) {
    for (const id of sec.photoIds || []) {
      if (id) ids.add(id)
    }
  }
  return ids
}

function photoApiUrl(token, photoId, variant) {
  const params = new URLSearchParams({ token, photoId })
  if (variant === 'thumb') params.set('variant', 'thumb')
  return `/api/public-report-photo?${params.toString()}`
}

export function mapReportSections(report, lead, token) {
  const photosById = Object.fromEntries((lead?.photos || []).map((p) => [p.id, p]))
  const sections = [...(report?.sections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return sections.map((sec) => ({
    id: sec.id,
    subtitle: sec.subtitle || '',
    description: sec.description || '',
    order: sec.order ?? 0,
    photos: (sec.photoIds || [])
      .map((photoId) => {
        const photo = photosById[photoId]
        if (!photo) return null
        return {
          id: photo.id,
          caption: photo.caption || photo.note || '',
          imageUrl: photoApiUrl(token, photo.id, 'full'),
          thumbUrl: photo.thumbnailKey
            ? photoApiUrl(token, photo.id, 'thumb')
            : photoApiUrl(token, photo.id, 'full'),
        }
      })
      .filter(Boolean),
  }))
}

export async function publicReportPayload(report, invite, lead, token) {
  let branding = null
  if (report?.ownerId) {
    try {
      branding = await resolveSenderBranding({
        uid: report.ownerId,
        email: report.ownerEmail || '',
      })
    } catch {
      branding = null
    }
  }

  return {
    report: {
      id: report.id,
      title: report.title,
      sections: mapReportSections(report, lead, token),
      status: report.status,
      sentAt: report.sentAt,
      hasPdf: !!report.pdfKey,
      viewCount: report.viewTracking?.viewCount || 0,
    },
    lead: lead
      ? { name: leadDisplayName(lead), address: lead.address || '' }
      : { name: 'Property', address: '' },
    recipientEmail: invite?.recipientEmail || null,
    message: invite?.message || '',
    branding: branding
      ? {
          businessName: branding.businessName,
          logoBase64: branding.logoBase64,
          senderName: branding.senderName,
          senderEmail: branding.senderEmail || report.ownerEmail || '',
        }
      : null,
    pdfDownloadUrl: report.pdfKey
      ? `/api/public-report?token=${encodeURIComponent(token)}&download=1`
      : null,
  }
}

export async function recordReportView(report, index, all, updatePhotoReportAtIndex) {
  const now = new Date().toISOString()
  const vt = report.viewTracking || { viewCount: 0 }
  const updated = {
    ...report,
    viewTracking: {
      firstViewedAt: vt.firstViewedAt || now,
      lastViewedAt: now,
      viewCount: (vt.viewCount || 0) + 1,
    },
    status: report.status === 'sent' ? 'viewed' : report.status,
    updatedAt: now,
  }
  await updatePhotoReportAtIndex(all, index, updated)
  return updated
}
