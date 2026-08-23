/**
 * Jobber Clients CSV detection, column preset, and address cleanup.
 */

const STREET_TOKEN = /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|hwy|highway|cir|circle|trl|trail|pkwy|parkway|pl|place)\b/i

const US_STATE_NAMES = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'newhampshire': 'NH',
  'newjersey': 'NJ',
  'newmexico': 'NM',
  'newyork': 'NY',
  'northcarolina': 'NC',
  'northdakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhodeisland': 'RI',
  'southcarolina': 'SC',
  'southdakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'westvirginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'districtofcolumbia': 'DC',
}

const JOBBER_PHONE_HEADERS = [
  'mainphones',
  'mobilephones',
  'workphones',
  'homephones',
  'otherphones',
  'textmessageenabledphone',
]

function normHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function unwrapJobberHeader(header) {
  const raw = String(header || '').trim()
  const wrapped = raw.match(/^(?:CFT|PFI)\s*\[(.*)\]\s*$/i)
  const inner = (wrapped ? wrapped[1] : raw).replace(/:+\s*$/, '').trim()
  return normHeader(inner)
}

export function isJobberClientCsv(headers = []) {
  const norms = new Set((headers || []).map(normHeader).filter(Boolean))
  if (!norms.has('jid')) return false
  const markers = ['displayname', 'servicestreet1', 'mainphones', 'companyname']
  return markers.filter((key) => norms.has(key)).length >= 2
}

function headerIndexMap(headers = []) {
  const map = new Map()
  headers.forEach((header, index) => {
    const key = normHeader(header)
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

function emptyJobberMapping() {
  return {
    firstName: '',
    lastName: '',
    fullName: '',
    companyName: '',
    address: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    notes: '',
    status: '',
    tags: '',
    customFields: {},
    phoneColumns: [],
    emailColumns: [],
    street2: '',
    propertyName: '',
    archived: '',
    clientId: '',
    source: 'jobber',
  }
}

export function applyJobberColumnPreset(headers = [], { customFields = [] } = {}) {
  const mapping = emptyJobberMapping()
  const indexOf = headerIndexMap(headers)
  const assign = (fieldId, headerKey) => {
    if (mapping[fieldId]) return
    if (!indexOf.has(headerKey)) return
    mapping[fieldId] = String(indexOf.get(headerKey))
  }

  assign('clientId', 'jid')
  assign('firstName', 'firstname')
  assign('lastName', 'lastname')
  assign('fullName', 'displayname')
  assign('companyName', 'companyname')
  assign('street', 'servicestreet1')
  assign('street2', 'servicestreet2')
  assign('propertyName', 'servicepropertyname')
  assign('city', 'servicecity')
  assign('state', 'servicestate')
  assign('zip', 'servicezipcode')
  if (!mapping.zip) assign('zip', 'servicezip')
  assign('email', 'emails')
  assign('tags', 'tags')
  assign('archived', 'archived')

  const phoneIndexes = JOBBER_PHONE_HEADERS
    .filter((key) => indexOf.has(key))
    .map((key) => String(indexOf.get(key)))
  if (phoneIndexes.length) {
    mapping.phone = phoneIndexes[0]
    mapping.phoneColumns = phoneIndexes.slice(1)
  }

  const used = new Set(
    [
      mapping.firstName,
      mapping.lastName,
      mapping.fullName,
      mapping.companyName,
      mapping.street,
      mapping.street2,
      mapping.propertyName,
      mapping.city,
      mapping.state,
      mapping.zip,
      mapping.phone,
      mapping.email,
      mapping.tags,
      mapping.archived,
      mapping.clientId,
      ...mapping.phoneColumns,
    ].filter(Boolean),
  )

  headers.forEach((header, index) => {
    const idx = String(index)
    if (used.has(idx)) return
    const unwrapped = unwrapJobberHeader(header)
    if (!unwrapped) return
    const match = (customFields || []).find((field) => normHeader(field.label) === unwrapped)
    if (match?.id && mapping.customFields[match.id] == null) {
      mapping.customFields[match.id] = idx
      used.add(idx)
    }
  })

  return mapping
}

export function jobberClientId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const cut = raw.indexOf('_')
  return cut === -1 ? raw : raw.slice(0, cut)
}

export function stripJobberStreetSuffix(street) {
  const raw = String(street || '').trim()
  if (!raw) return ''
  const bullet = raw.search(/\s*•\s*/)
  if (bullet === -1) return raw
  return raw.slice(0, bullet).trim()
}

export function normalizeJobberState(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  const key = raw.toLowerCase().replace(/[^a-z]+/g, '')
  return US_STATE_NAMES[key] || raw
}

export function looksLikeStreetLine(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (/^\d+\s+\S/.test(raw)) return true
  return STREET_TOKEN.test(raw)
}

export function isArchivedImportValue(value) {
  const raw = String(value || '').trim().toLowerCase()
  return raw === 'true' || raw === 'yes' || raw === '1'
}

export function splitContactDisplayName(raw) {
  const original = String(raw || '').trim()
  if (!original) return { firstName: '', lastName: '' }

  const upper = original.toUpperCase()
  const business = /\b(LLC|INC|INCORPORATED|CORP|CORPORATION|COMPANY|LP|LLP|LTD|TRUST|PROPERTIES|HOLDINGS)\b/.test(upper)
    || /\b(CITY OF|COUNTY OF|STATE OF|ESTATE OF)\b/.test(upper)
  if (business) return { firstName: '', lastName: original }

  if (original.includes(',')) {
    const [last, ...rest] = original.split(',')
    return {
      firstName: rest.join(',').trim(),
      lastName: last.trim(),
    }
  }

  const parts = original.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: '', lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function groupRowsByClientId(rows, clientIdIndex) {
  const groups = new Map()
  ;(rows || []).forEach((row, rowIndex) => {
    const raw = clientIdIndex === '' || clientIdIndex == null
      ? ''
      : String(row?.[Number(clientIdIndex)] ?? '').trim()
    const id = jobberClientId(raw) || `row_${rowIndex}`
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push({ row, rowIndex })
  })
  return groups
}
