/** Strip to US national number digits (max 10). Leading 1 dropped when 11 digits. */
export function parsePhoneDigits(value) {
  if (value == null || value === '') return ''
  let digits = String(value).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1)
  }
  return digits.slice(0, 10)
}

/** Format partial or full US phone as (XXX) XXX-XXXX. */
export function formatPhoneUS(value) {
  const digits = parsePhoneDigits(value)
  if (!digits) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function formatPhoneDisplay(value) {
  return formatPhoneUS(value)
}

export function formatPhoneAsYouType(value) {
  return formatPhoneUS(value)
}

/** Formatted US phone for storage, or null when empty. */
export function normalizePhoneForStorage(value) {
  const digits = parsePhoneDigits(value)
  if (!digits) return null
  return formatPhoneUS(digits)
}

/** Digits (or +digits) for tel:/sms: links. */
export function normalizePhoneForTel(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) {
    const digits = raw.replace(/\D/g, '')
    return digits ? `+${digits}` : ''
  }
  return parsePhoneDigits(raw)
}

export function phoneMatchesQuery(phone, query) {
  const q = String(query || '').trim()
  if (!q) return true
  const display = String(phone || '')
  if (display.toLowerCase().includes(q.toLowerCase())) return true
  const qDigits = parsePhoneDigits(q)
  if (qDigits) return parsePhoneDigits(display).includes(qDigits)
  return false
}
