/**
 * Email/text templates for photo report delivery.
 */

import { getSettings, updateSettings } from './settings'
import {
  migrateLegacyReportTemplateText,
  replaceReportSendTags,
  REPORT_SEND_TAGS,
} from './sendTemplateTags'

export { REPORT_SEND_TAGS }

export const DEFAULT_REPORT_EMAIL_SUBJECT = 'Photo report: {{reportTitle}}'
export const DEFAULT_REPORT_EMAIL_BODY = `Hi {{clientName}},

Please review the photo report for your property.

{{reportLink}}

Thank you,
{{senderName}}
{{companyName}}`

export const DEFAULT_REPORT_TEXT_BODY = `Hi {{clientName}}, your photo report "{{reportTitle}}" is ready: {{reportLink}} — {{senderName}}, {{companyName}}`

export function replaceReportTags(template, data) {
  return replaceReportSendTags(template, data)
}

/** Replace report link placeholders in editable message text. */
export function applyReportLinkToText(text, link) {
  if (!link) return String(text || '')
  const withLegacy = String(text || '')
    .split('{ReportLink}').join(link)
    .split('{{reportLink}}').join(link)
  return withLegacy.split('[link will appear after send]').join(link)
}

function normalizeStoredTemplate(value, fallback) {
  const raw = value || fallback
  return migrateLegacyReportTemplateText(raw)
}

export function getReportSendTemplatesFromSettings(settings = null) {
  const s = settings || getSettings()
  const t = s.reportSendTemplates || {}
  return {
    emailSubject: normalizeStoredTemplate(t.emailSubject, DEFAULT_REPORT_EMAIL_SUBJECT),
    emailBody: normalizeStoredTemplate(t.emailBody, DEFAULT_REPORT_EMAIL_BODY),
    textBody: normalizeStoredTemplate(t.textBody, DEFAULT_REPORT_TEXT_BODY),
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
