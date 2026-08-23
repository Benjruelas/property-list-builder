/**
 * RFC4180-ish CSV parse / escape helpers.
 */

export function escapeCsvValue(val) {
  if (val == null || val === '') return ''
  const str = String(val)
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(headers, rows = []) {
  const head = (headers || []).map(escapeCsvValue).join(',')
  const body = (rows || []).map((row) => (row || []).map(escapeCsvValue).join(','))
  return [head, ...body].join('\n')
}

function stripBom(text) {
  const s = String(text ?? '')
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Parse CSV text into a header row and data rows.
 * Supports quoted fields, escaped quotes, and newlines inside quotes.
 *
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(text) {
  const input = stripBom(text)
  const records = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }

  const pushRow = () => {
    pushField()
    const hasValue = row.some((cell) => String(cell || '').trim() !== '')
    if (hasValue) records.push(row)
    row = []
  }

  while (i < input.length) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      pushField()
      i += 1
      continue
    }
    if (ch === '\n') {
      pushRow()
      i += 1
      continue
    }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1
      pushRow()
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (inQuotes || field.length > 0 || row.length > 0) {
    pushRow()
  }

  if (records.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = records[0].map((h) => String(h ?? '').trim())
  const rows = records.slice(1).map((r) => {
    const next = r.slice()
    while (next.length < headers.length) next.push('')
    return next
  })
  return { headers, rows }
}
