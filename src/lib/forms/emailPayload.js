/**
 * Pure builder for the /api/forms-send request body. Isolated from React
 * so it can be unit tested without a DOM.
 *
 * Inputs:
 *  - template: the form template the user just filled
 *  - values  : map of fieldId -> value (strings, booleans, or signature PNG data URLs)
 *  - recipient, subject, message: email metadata from the Send modal
 *  - flattenedPdfBase64: base64 of the flattened PDF produced by the worker
 *
 * Output:
 *  - a plain object ready to JSON.stringify into fetch body
 *
 * Validation throws rather than silently trimming so the UI can surface errors.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function stripDataUrlPrefix(b64) {
  if (typeof b64 !== 'string') return ''
  return b64.replace(/^data:application\/pdf;base64,/, '')
}

/**
 * @param {object} opts
 * @param {{ id: string, name?: string, fields?: Array }} opts.template
 * @param {Record<string, any>} [opts.values]
 * @param {string} opts.recipient
 * @param {string} [opts.subject]
 * @param {string} [opts.message]
 * @param {boolean} [opts.sendMeCopy]
 * @param {string} opts.flattenedPdfBase64
 */
export function buildSendPayload({ template, values = {}, recipient, subject, message, sendMeCopy = false, flattenedPdfBase64 }) {
  if (!template || !template.id) {
    throw new Error('template is required')
  }
  const trimmedRecipient = String(recipient || '').trim()
  if (!EMAIL_RE.test(trimmedRecipient)) {
    throw new Error('Valid recipient email is required')
  }
  const cleanedPdf = stripDataUrlPrefix(flattenedPdfBase64)
  if (!cleanedPdf) {
    throw new Error('Flattened PDF is missing')
  }

  const templateName = template.name ? String(template.name) : 'Form'
  const safeSubject = (subject && String(subject).trim()) || `Completed form: ${templateName}`
  const safeMessage = message ? String(message) : ''

  // Drop signature data URLs from the values payload — they are embedded in
  // the flattened PDF already and just bloat the request body.
  const strippedValues = {}
  const fieldsById = new Map((template.fields || []).map((f) => [f.id, f]))
  for (const [fieldId, value] of Object.entries(values || {})) {
    const field = fieldsById.get(fieldId)
    if (field && field.type === 'signature') {
      strippedValues[fieldId] = value ? '[signature]' : ''
    } else if (typeof value === 'boolean') {
      strippedValues[fieldId] = value
    } else {
      strippedValues[fieldId] = value == null ? '' : String(value)
    }
  }

  return {
    templateId: template.id,
    templateName,
    recipientEmail: trimmedRecipient,
    subject: safeSubject,
    message: safeMessage,
    sendMeCopy: !!sendMeCopy,
    pdfBase64: cleanedPdf,
    values: strippedValues,
  }
}

export const __test__ = { EMAIL_RE, stripDataUrlPrefix }
