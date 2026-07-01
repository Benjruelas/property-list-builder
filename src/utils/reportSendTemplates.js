/**
 * Email/text templates for photo report delivery.
 */

import { getSettings, updateSettings } from './settings'

export const REPORT_SEND_TAGS = [
  '{ClientName}',
  '{ReportTitle}',
  '{ReportLink}',
  '{SenderName}',
  '{CompanyName}',
  '{LeadAddress}',
]

export const DEFAULT_REPORT_EMAIL_SUBJECT = 'Photo report: {ReportTitle}'
export const DEFAULT_REPORT_EMAIL_BODY = `Hi {ClientName},

Please review the photo report for your property.

{ReportLink}

Thank you,
{SenderName}
{CompanyName}`

export const DEFAULT_REPORT_TEXT_BODY = `Hi {ClientName}, your photo report "{ReportTitle}" is ready: {ReportLink} — {SenderName}, {CompanyName}`

export function replaceReportTags(template, data) {
  let out = String(template || '')
  for (const [key, value] of Object.entries(data)) {
    const tag = `{${key}}`
    out = out.split(tag).join(value ?? '')
  }
  return out
}

/** Replace report link placeholders in editable message text. */
export function applyReportLinkToText(text, link) {
  if (!link) return String(text || '')
  return String(text || '')
    .split('{ReportLink}').join(link)
    .split('[link will appear after send]').join(link)
}

export function getReportSendTemplatesFromSettings(settings = null) {
  const s = settings || getSettings()
  const t = s.reportSendTemplates || {}
  return {
    emailSubject: t.emailSubject || DEFAULT_REPORT_EMAIL_SUBJECT,
    emailBody: t.emailBody || DEFAULT_REPORT_EMAIL_BODY,
    textBody: t.textBody || DEFAULT_REPORT_TEXT_BODY,
  }
}

export function buildReportSendTemplatesPatch({ emailSubject, emailBody, textBody }) {
  return {
    reportSendTemplates: {
      emailSubject: emailSubject || DEFAULT_REPORT_EMAIL_SUBJECT,
      emailBody: emailBody || DEFAULT_REPORT_EMAIL_BODY,
      textBody: textBody || DEFAULT_REPORT_TEXT_BODY,
    },
  }
}

export async function saveReportSendTemplates(getToken, templates) {
  return updateSettings(buildReportSendTemplatesPatch(templates), getToken)
}
