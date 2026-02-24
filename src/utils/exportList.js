/**
 * Parse an address string into street, city, state, zip.
 * State and zip are typically together with a space (e.g. "TX 76102"), not a comma.
 * Mailing Address (street) must NOT include city, state, or zip.
 */
function parseAddress(addressStr) {
  if (!addressStr || !String(addressStr).trim()) {
    return { street: '', city: '', state: '', zip: '' }
  }
  const str = String(addressStr).trim()

  // First extract state and zip - match "STATE ZIP" or ", STATE ZIP" (flexible: space or comma before)
  // Handles: "TX 76102", "Fort Worth TX 76102", "123 Main St, Fort Worth TX 76102"
  const stateZipRegex = /[,]?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i
  const stateZipMatch = str.match(stateZipRegex)

  if (stateZipMatch) {
    const state = (stateZipMatch[1] || '').toUpperCase()
    const zip = stateZipMatch[2] || ''
    // Remainder = everything before state/zip (and the comma/space before them)
    const remainder = str.slice(0, stateZipMatch.index).trim().replace(/,\s*$/, '')

    // Split remainder into street and city (by comma if present)
    if (remainder.includes(',')) {
      const parts = remainder.split(',').map((p) => p.trim()).filter(Boolean)
      const city = parts[parts.length - 1] || ''
      const street = parts.slice(0, -1).join(', ') || ''
      return { street, city, state, zip }
    }

    // No comma - remainder is "Street City" (e.g. "123 MAIN ST FORT WORTH")
    // Assume last 1-2 words are city, rest is street
    const words = remainder.split(/\s+/).filter(Boolean)
    let city = ''
    let street = remainder
    if (words.length >= 2) {
      // Last word or last two words (e.g. "FORT WORTH") as city
      const lastWord = words[words.length - 1]
      const twoWords = words.length >= 2 ? words.slice(-2).join(' ') : lastWord
      city = words.length >= 3 ? twoWords : lastWord
      street = words.slice(0, words.length - (words.length >= 3 ? 2 : 1)).join(' ')
    }
    return { street, city, state, zip }
  }

  // No state/zip found - simple comma split
  const parts = str.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { street: parts[0], city: parts[parts.length - 1], state: '', zip: '' }
  }
  return { street: str, city: '', state: '', zip: '' }
}

/**
 * Get parsed SITUS (property) address only. Never uses mailing address fields.
 */
function getPropertyAddress(props, parcel) {
  const fullAddr = parcel.address || props.SITUS_ADDR || props.SITE_ADDR || ''
  const city = props.scity || props.PROP_CITY || props.SITUS_CITY || props.CITY || ''
  const state = props.state2 || props.PROP_STATE || props.SITUS_STATE || props.STATE || ''
  const zip = (props.szip || props.szip5 || props.PROP_ZIP || props.SITUS_ZIP || props.ZIP || props.ZIP_CODE || '').toString().trim()
  if (city || state || zip) {
    return {
      street: fullAddr || props.STREET || props.ADDR_LINE1 || props.saddstr || '',
      city,
      state,
      zip
    }
  }
  const parsed = parseAddress(fullAddr)
  return parsed.street || parsed.city || parsed.state || parsed.zip ? parsed : { street: fullAddr, city: '', state: '', zip: '' }
}

/**
 * Get parsed mailing address from parcel props.
 */
function getMailingAddress(props) {
  const fullAddr = props.MAIL_ADDR || props.MAILING_ADDR || ''
  if (props.MAIL_CITY || props.MAIL_STATE || props.MAIL_ZIP) {
    return {
      street: fullAddr || props.MAIL_STREET || '',
      city: props.MAIL_CITY || '',
      state: props.MAIL_STATE || '',
      zip: props.MAIL_ZIP || ''
    }
  }
  const parsed = parseAddress(fullAddr)
  return parsed
}

/**
 * Convert list parcels to CSV format for export.
 *
 * @param {Object} list - List object with parcels array
 * @returns {string} CSV content
 */
export function listToCsv(list) {
  const parcels = list?.parcels || []
  if (parcels.length === 0) {
    return 'Address,City,State,Zip,Owner Name,Mailing Address,Mailing City,Mailing State,Mailing Zip\n'
  }

  const escapeCsv = (val) => {
    if (val == null || val === '') return ''
    const str = String(val)
    if (/[,"\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const headers = ['Address', 'City', 'State', 'Zip', 'Owner Name', 'Mailing Address', 'Mailing City', 'Mailing State', 'Mailing Zip']

  const rows = parcels.map((parcel) => {
    const props = parcel.properties || parcel
    const addr = getPropertyAddress(props, parcel)
    const mailAddr = getMailingAddress(props)

    return [
      addr.street,
      addr.city,
      addr.state,
      addr.zip,
      props.OWNER_NAME || '',
      mailAddr.street,
      mailAddr.city,
      mailAddr.state,
      mailAddr.zip
    ].map(escapeCsv)
  })

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}
