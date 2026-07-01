import { findReportInviteByToken } from './reportInvites.js'
import { getPhotoReportById, getAllPhotoReports } from './reportStore.js'
import { parseReportPreviewToken } from './previewToken.js'

/**
 * Resolve a public report from an invite token, signed preview token, or legacy previewToken.
 * @returns {{ invite, report, index, all, error: string|null, status?: number }}
 */
export async function loadReportContext(token) {
  const normalized = String(token || '').trim()
  const { invite, error } = await findReportInviteByToken(normalized)

  if (error && error !== 'not_found') {
    if (error === 'revoked' || error === 'expired') {
      return { error: 'This report link has expired', status: 410 }
    }
  }

  if (!error && invite) {
    const { report, index, all } = await getPhotoReportById(invite.reportId)
    if (!report) return { error: 'Report not found', status: 404 }
    return { invite, report, index, all, error: null }
  }

  const signedReportId = parseReportPreviewToken(normalized)
  if (signedReportId) {
    const { report, index, all } = await getPhotoReportById(signedReportId)
    if (!report) return { error: 'Report not found', status: 404 }
    const previewInvite = {
      token: normalized,
      reportId: report.id,
      preview: true,
      recipientEmail: '',
      message: '',
      status: 'pending',
    }
    return { invite: previewInvite, report, index, all, error: null }
  }

  const all = await getAllPhotoReports()
  const index = all.findIndex((r) => r.previewToken === normalized || r.publicToken === normalized)
  if (index === -1) return { error: 'Report link not found', status: 404 }

  const report = all[index]
  const previewInvite = {
    token: normalized,
    reportId: report.id,
    preview: true,
    recipientEmail: '',
    message: '',
    status: 'pending',
  }
  return { invite: previewInvite, report, index, all, error: null }
}
