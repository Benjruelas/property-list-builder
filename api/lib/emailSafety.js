/**
 * Helpers to keep outbound email safe from header injection and HTML injection.
 */

/** Strip CR/LF (and control chars) so a value can't inject extra email headers. */
export function sanitizeHeader(value, maxLen = 200) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLen)
}

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Basic RFC-ish email shape check for a single address. */
export function isValidEmail(email) {
  const s = String(email || '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254
}
