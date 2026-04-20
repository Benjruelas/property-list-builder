import { useEffect, useState, useRef } from 'react'
import { getSkipTracedParcel, updateContactMeta, updateSkipTracedContacts } from '@/utils/skipTrace'
import { getParcelNote, saveParcelNote } from '@/utils/parcelNotes'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { computeOwnerOccupied } from '@/utils/ownerOccupied'

const PROPERTY_LABELS = {
  PROP_ID: 'Parcel ID', PROPID: 'Property ID', PARCEL_ID: 'Parcel ID', PARCEL_ID_ALT: 'Alternate Parcel ID', PIN: 'Parcel Number', APN: 'Assessor Parcel Number',
  SITUS_ADDR: 'Site Address', SITE_ADDR: 'Street Address', ADDRESS: 'Address', ADDR: 'Address',
  SITUS: 'Situs Address', SITEADRESS: 'Site Address', SITEADDRESS: 'Site Address',
  OWNER_NAME: 'Owner', OWNER: 'Owner', OWNERNME1: 'Owner Name', MAIL_OWNER: 'Mailing Owner',
  LOC_LAND_U: 'Land Use', LAND_USE: 'Land Use', LAND_USE_CODE: 'Land Use Code', LAND_USE_CLASS: 'Land Use Class',
  USE_CODE: 'Land Use Code', USE_DESC: 'Land Use',
  PROP_CLASS: 'Property Class', PROPCLASS: 'Property Class', PROPERTY_CLASS: 'Property Class',
  YEAR_BUILT: 'Year Built', YEARBLT: 'Year Built',
  SQFT: 'Square Feet', SQ_FT: 'Square Feet', BLDG_SQFT: 'Building Sq Ft', LIVING_SQFT: 'Living Square Feet',
  NUM_BLDGS: 'Buildings', NUM_UNITS: 'Units', NUM_FLOORS: 'Floors',
  ACRES: 'Acres', ACREAGE: 'Acreage', GIS_ACRES: 'Acres', ASSDACRES: 'Assessed Acres',
  CALC_AREA_SQM: 'Lot Area',
  BEDROOMS: 'Bedrooms', BEDROOM: 'Bedrooms', BEDS: 'Bedrooms',
  BATHROOMS: 'Full Baths', BATHROOM: 'Bathrooms', BATHS: 'Bathrooms', HALF_BATHS: 'Half Baths',
  MKT_VAL: 'Total Assessed Value', TOTAL_VALUE: 'Total Value', ASSESSED_VALUE: 'Assessed Value', MRKT_VAL_TOT: 'Market Value',
  LAND_VAL: 'Land Value', LAND_VALUE: 'Land Value', LNDVALUE: 'Land Value', MRKT_VAL_LAND: 'Land Market Value',
  IMPR_VAL: 'Improvement Value', IMPROVEMENT_VALUE: 'Improvement Value', IMPVALUE: 'Improvement Value', MRKT_VAL_BLDG: 'Building Value',
  AG_VAL: 'Agriculture Value',
  SALE_PRICE: 'Last Sale Price', SALE_DATE: 'Last Sale Date',
  TAX_ACCT: 'Tax Account #', TAX_YEAR: 'Tax Year', TAXROLLYEAR: 'Tax Year', ASMT_LEVYR: 'Assessment Year',
  LATITUDE: 'Latitude', LAT: 'Latitude',
  LONGITUDE: 'Longitude', LNG: 'Longitude', LON: 'Longitude',
  MAIL_ADDR: 'Mailing Address', MAILING_ADDR: 'Mailing Address', PSTLADRESS: 'Mailing Address',
  MAIL_CITY: 'Mailing City', MAIL_STATE: 'Mailing State', MAIL_ZIP: 'Mailing Zip',
  SITUS_CITY: 'City', PROP_CITY: 'City', CITY: 'City',
  SITUS_STATE: 'State', PROP_STATE: 'State', STATE: 'State', state2: 'State',
  SITUS_ZIP: 'Zip Code', PROP_ZIP: 'Zip Code', ZIP: 'Zip Code', ZIP_CODE: 'Zip Code', szip: 'Zip Code', szip5: 'Zip Code',
  LEGAL_DESC: 'Legal Description', LEGAL_DESCRIP: 'Legal Description',
  SUBDIVISION: 'Subdivision', SUBDIV: 'Subdivision',
  LOT: 'Lot', LOT_NUM: 'Lot Number',
  BLOCK: 'Block', BLOCK_NUM: 'Block Number',
  BOOK: 'Book', PAGE: 'Page',
  TOWNSHIP: 'Township', SECTION: 'Section', QTR_SECTION: 'Quarter Section', RANGE: 'Range',
  ZONING: 'Zoning', ZONING_CODE: 'Zoning Code',
  COUNTY: 'County', COUNTY_NAME: 'County', CONAME: 'County', COUNTY_FIPS: 'County FIPS',
  CENSUS_TRACT: 'Census Tract', PLACE_NAME: 'Place Name',
  LAST_UPDATED: 'Data Last Updated',
  SCITY: 'City', ADDR_LINE1: 'Address Line 1', STREET: 'Street',
}

const CURRENCY_KEYS = new Set(['MKT_VAL', 'LAND_VAL', 'IMPR_VAL', 'AG_VAL', 'SALE_PRICE', 'TOTAL_VALUE', 'LAND_VALUE', 'IMPROVEMENT_VALUE', 'ASSESSED_VALUE', 'LNDVALUE', 'IMPVALUE', 'MRKT_VAL_TOT', 'MRKT_VAL_LAND', 'MRKT_VAL_BLDG'])
const SQFT_KEYS = new Set(['SQFT', 'SQ_FT', 'BLDG_SQFT', 'LIVING_SQFT'])
const ACRE_KEYS = new Set(['ACRES', 'ACREAGE', 'GIS_ACRES', 'ASSDACRES'])
const DATE_KEYS = new Set(['SALE_DATE', 'LAST_UPDATED'])
const ZERO_OK_KEYS = new Set(['BEDROOMS', 'BATHROOMS', 'HALF_BATHS', 'NUM_BLDGS', 'NUM_UNITS', 'NUM_FLOORS', 'TAX_YEAR', 'YEAR_BUILT'])

export const CATEGORIES = {
  identification: { title: 'Identification', keys: ['PROP_ID', 'PROPID', 'PARCEL_ID', 'PARCEL_ID_ALT', 'PIN', 'APN', 'TAXPARCELID', 'ACCOUNT', 'TAX_ACCT'] },
  address: { title: 'Address', keys: ['SITUS_ADDR', 'SITE_ADDR', 'ADDRESS', 'ADDR', 'SITUS', 'SITEADRESS', 'SITEADDRESS', 'ADDR_LINE1', 'STREET', 'SITUS_CITY', 'PROP_CITY', 'SITUS_STATE', 'PROP_STATE', 'STATE', 'state2', 'SITUS_ZIP', 'PROP_ZIP', 'ZIP', 'ZIP_CODE', 'szip', 'szip5'] },
  ownership: { title: 'Ownership', keys: ['OWNER_NAME', 'OWNER', 'OWNERNME1', 'MAIL_OWNER'] },
  property: { title: 'Property', keys: ['USE_CODE', 'USE_DESC', 'LOC_LAND_U', 'LAND_USE', 'LAND_USE_CODE', 'LAND_USE_CLASS', 'PROP_CLASS', 'PROPCLASS', 'PROPERTY_CLASS', 'YEAR_BUILT', 'YEARBLT', 'SQFT', 'SQ_FT', 'BLDG_SQFT', 'LIVING_SQFT', 'NUM_BLDGS', 'NUM_UNITS', 'NUM_FLOORS', 'ACRES', 'ACREAGE', 'GIS_ACRES', 'ASSDACRES', 'CALC_AREA_SQM', 'BEDROOMS', 'BEDROOM', 'BEDS', 'BATHROOMS', 'BATHROOM', 'BATHS', 'HALF_BATHS', 'ZONING', 'ZONING_CODE'] },
  valuation: { title: 'Valuation', keys: ['MKT_VAL', 'TOTAL_VALUE', 'ASSESSED_VALUE', 'MRKT_VAL_TOT', 'LAND_VAL', 'LAND_VALUE', 'LNDVALUE', 'MRKT_VAL_LAND', 'IMPR_VAL', 'IMPROVEMENT_VALUE', 'IMPVALUE', 'MRKT_VAL_BLDG', 'AG_VAL', 'SALE_PRICE', 'SALE_DATE', 'TAX_YEAR', 'TAXROLLYEAR', 'ASMT_LEVYR'] },
  location: { title: 'Location', keys: ['LATITUDE', 'LAT', 'LONGITUDE', 'LNG', 'LON', 'COUNTY', 'COUNTY_NAME', 'CONAME', 'COUNTY_FIPS', 'CENSUS_TRACT', 'PLACE_NAME', 'LAST_UPDATED'] },
  mailing: { title: 'Mailing Address', keys: ['MAIL_ADDR', 'MAILING_ADDR', 'PSTLADRESS', 'MAIL_CITY', 'MAIL_STATE', 'MAIL_ZIP'] },
  legal: { title: 'Legal & Lot', keys: ['LEGAL_DESC', 'LEGAL_DESCRIP', 'SUBDIVISION', 'SUBDIV', 'LOT', 'LOT_NUM', 'BLOCK', 'BLOCK_NUM', 'BOOK', 'PAGE', 'TOWNSHIP', 'SECTION', 'QTR_SECTION', 'RANGE'] },
}

const keyToCategoryMap = {}
Object.entries(CATEGORIES).forEach(([cat, { keys }]) => keys.forEach(k => { keyToCategoryMap[k] = cat }))

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return null
  const str = String(value).trim()
  if (!str || (str === '0' && !ZERO_OK_KEYS.has(key))) return null
  const upperKey = (key || '').toUpperCase()
  if (CURRENCY_KEYS.has(upperKey)) {
    const num = parseFloat(String(value).replace(/[$,]/g, ''))
    if (!isNaN(num)) return `$${num.toLocaleString()}`
  }
  if (SQFT_KEYS.has(upperKey)) {
    const num = parseFloat(String(value).replace(/,/g, ''))
    if (!isNaN(num)) return `${num.toLocaleString()} sq ft`
  }
  if (ACRE_KEYS.has(upperKey)) {
    const num = parseFloat(value)
    if (!isNaN(num)) return `${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} ac`
  }
  if (upperKey === 'CALC_AREA_SQM') {
    const num = parseFloat(value)
    if (!isNaN(num)) return `${(num * 10.7639).toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft`
  }
  if (DATE_KEYS.has(upperKey)) {
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { /* fall through */ }
  }
  return str
}

function keyToLabel(key) {
  return PROPERTY_LABELS[key] || PROPERTY_LABELS[key?.toUpperCase()] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function normalizeParcelForDetails(raw) {
  if (!raw) return null
  const props = { ...(raw.properties || {}) }
  const propertyLikeKeys = ['PROP_ID', 'PROPID', 'SITUS_ADDR', 'SITE_ADDR', 'ADDRESS', 'OWNER_NAME', 'OWNER', 'OWNERNME1', 'YEAR_BUILT', 'YEARBLT', 'SQFT', 'ACRES', 'TOTAL_VALUE', 'LATITUDE', 'LONGITUDE', 'LAT', 'LNG', 'LON', 'LOC_LAND_U', 'LAND_USE', 'MAIL_ADDR', 'LEGAL_DESC', 'BEDROOMS', 'BATHROOMS', 'COUNTY', 'COUNTY_FIPS', 'CENSUS_TRACT', 'PLACE_NAME', 'ZIP', 'STATE', 'CITY', 'MAIL_CITY', 'MAIL_STATE', 'MAIL_ZIP', 'PROP_CLASS', 'SUBDIVISION', 'LOT', 'BLOCK', 'ZONING']
  for (const key of propertyLikeKeys) {
    if (raw[key] != null && raw[key] !== '' && !(key in props)) props[key] = raw[key]
  }
  const id = raw.id || raw.properties?.PROP_ID || raw.PROP_ID || raw.PROPID
  const address = raw.address || props.SITUS_ADDR || props.SITE_ADDR || props.ADDRESS || 'No address available'
  const lat = raw.lat ?? raw.latlng?.lat ?? props.LATITUDE ?? props.LAT
  const lng = raw.lng ?? raw.latlng?.lng ?? props.LONGITUDE ?? props.LNG ?? props.LON
  return { id, properties: props, address, lat: lat != null ? parseFloat(lat) : null, lng: lng != null ? parseFloat(lng) : null }
}

export function useParcelDetailsData({ isOpen, parcelData, lists = [], enableAutoClose = true, onClose }) {
  const { scheduleSync } = useUserDataSync()
  const [skipTracedInfo, setSkipTracedInfo] = useState(null)
  const [note, setNote] = useState('')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [callerIdDraft, setCallerIdDraft] = useState({})
  const [editContacts, setEditContacts] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const containerRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const inactivityTimeoutRef = useRef(null)

  const parcelId = parcelData?.id || parcelData?.properties?.PROP_ID || parcelData?.PROP_ID || parcelData?.PROPID

  const refreshSkipTrace = () => {
    if (parcelId) setSkipTracedInfo(getSkipTracedParcel(parcelId))
  }

  useEffect(() => {
    if (isOpen && parcelId) {
      const info = getSkipTracedParcel(parcelId)
      setSkipTracedInfo(info)
      const savedNote = getParcelNote(parcelId)
      setNote(savedNote || '')
      setIsEditingNote(false)
      const timeout = setTimeout(() => setSkipTracedInfo(getSkipTracedParcel(parcelId)), 500)
      return () => clearTimeout(timeout)
    }
  }, [isOpen, parcelId, parcelData])

  useEffect(() => {
    if (!enableAutoClose || !isOpen || !onClose) return
    const resetTimer = () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current)
      inactivityTimeoutRef.current = setTimeout(() => {
        if (typeof onClose === 'function') onClose({ reopenPopup: false })
      }, 5000)
    }
    const handleInteraction = (e) => {
      if (containerRef.current?.contains(e.target)) resetTimer()
    }
    resetTimer()
    const opts = { capture: true }
    document.addEventListener('mousedown', handleInteraction, opts)
    document.addEventListener('touchstart', handleInteraction, opts)
    document.addEventListener('keydown', handleInteraction, opts)
    const scrollEl = scrollContainerRef.current || containerRef.current?.querySelector('.parcel-details-scroll')
    if (scrollEl) scrollEl.addEventListener('scroll', resetTimer, opts)
    return () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current)
      document.removeEventListener('mousedown', handleInteraction, opts)
      document.removeEventListener('touchstart', handleInteraction, opts)
      document.removeEventListener('keydown', handleInteraction, opts)
      if (scrollEl) scrollEl.removeEventListener('scroll', resetTimer, opts)
    }
  }, [enableAutoClose, isOpen, onClose])

  const normalized = normalizeParcelForDetails(parcelData)
  if (!normalized) return null

  const properties = normalized.properties || {}
  const address = normalized.address || properties.SITUS_ADDR || properties.SITE_ADDR || properties.ADDRESS || 'No address available'

  const currentYear = new Date().getFullYear()
  const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
  const age = yearBuilt ? currentYear - yearBuilt : null

  const ownerOccupied = computeOwnerOccupied(properties)

  const listsWithParcel = lists.filter(l =>
    (l.parcels || []).some(p => (p.id || p.properties?.PROP_ID || p) === parcelId)
  )

  const ownerName = properties.OWNER_NAME || properties.OWNER || properties.OWNERNME1 || ''
  const phoneDetails = skipTracedInfo?.phoneDetails || (skipTracedInfo?.phoneNumbers?.length ? skipTracedInfo.phoneNumbers.map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 })) : [])
  const emailDetails = skipTracedInfo?.emailDetails || (skipTracedInfo?.emails?.length ? skipTracedInfo.emails.map((v, i) => ({ value: v, verified: null, primary: i === 0 })) : [])

  const buildCategorizedProperties = () => {
    const result = { identification: [], address: [], ownership: [], property: [], valuation: [], location: [], mailing: [], legal: [], other: [] }
    const seen = new Set()
    const addToList = (cat, key, value) => {
      if (seen.has(key)) return
      seen.add(key)
      const formatted = formatValue(key, value)
      if (formatted) result[cat].push({ key, label: keyToLabel(key), value: formatted })
    }
    Object.entries(properties).forEach(([key, value]) => {
      const cat = keyToCategoryMap[key] || keyToCategoryMap[key?.toUpperCase()] || 'other'
      addToList(cat, key, value)
    })
    if (normalized.lat != null && !seen.has('LATITUDE')) addToList('location', 'LATITUDE', normalized.lat)
    if (normalized.lng != null && !seen.has('LONGITUDE')) addToList('location', 'LONGITUDE', normalized.lng)
    if (address && result.address.length === 0) addToList('address', 'ADDRESS', address)
    if (listsWithParcel.length > 0) addToList('ownership', 'In lists', listsWithParcel.map(l => l.name).join(', '))
    if (ownerOccupied) addToList('ownership', 'Owner Occupied', ownerOccupied)
    addToList('property', 'Age', age != null ? `${age} years` : 'Unknown')
    return result
  }

  const categorizedProps = buildCategorizedProperties()

  const quickStats = {
    value: categorizedProps.valuation.find(i => ['MKT_VAL', 'TOTAL_VALUE', 'ASSESSED_VALUE', 'MRKT_VAL_TOT'].includes(i.key))?.value,
    sqft: categorizedProps.property.find(i => ['SQFT', 'SQ_FT', 'BLDG_SQFT', 'LIVING_SQFT'].includes(i.key))?.value,
    yearBuilt: properties.YEAR_BUILT || properties.YEARBLT || null,
    beds: properties.BEDROOMS || properties.BEDROOM || properties.BEDS || null,
    baths: properties.BATHROOMS || properties.BATHROOM || properties.BATHS || null,
    halfBaths: properties.HALF_BATHS || null,
    acres: categorizedProps.property.find(i => ['ACRES', 'ACREAGE', 'GIS_ACRES', 'ASSDACRES', 'CALC_AREA_SQM'].includes(i.key))?.value,
    zoning: properties.ZONING || properties.ZONING_CODE || null,
    age: age != null ? `${age} yrs` : null,
    landUse: properties.USE_DESC || properties.LOC_LAND_U || properties.LAND_USE || null,
  }

  const normalizePhoneNumber = (phone) => (phone || '').replace(/[^\d+]/g, '')
  const cycleVerified = (current) => (current === 'good' ? 'bad' : current === 'bad' ? null : 'good')

  const handleSetVerified = (type, value, next) => {
    if (!parcelId) return
    updateContactMeta(parcelId, type, value, { verified: next }); scheduleSync()
    setSkipTracedInfo(getSkipTracedParcel(parcelId))
  }

  const handleCallerIdBlur = (value, callerId) => {
    if (!parcelId) return
    updateContactMeta(parcelId, 'phone', value, { callerId: (callerId || '').trim() }); scheduleSync()
    setSkipTracedInfo(getSkipTracedParcel(parcelId))
    setCallerIdDraft(prev => { const next = { ...prev }; delete next[value]; return next })
  }

  const handleSaveNote = () => {
    if (parcelId) { saveParcelNote(parcelId, note); setIsEditingNote(false); scheduleSync() }
  }

  const handleCancelNote = () => {
    if (parcelId) { setNote(getParcelNote(parcelId) || ''); setIsEditingNote(false) }
  }

  const handleClose = (reopenPopup) => {
    if (typeof onClose === 'function') onClose({ reopenPopup })
  }

  const addPhone = () => {
    if (newPhone.trim()) {
      updateSkipTracedContacts(parcelId, 'phone', [...phoneDetails, { value: newPhone.trim(), primary: phoneDetails.length === 0 }])
      setNewPhone(''); refreshSkipTrace(); scheduleSync()
    }
  }

  const addEmail = () => {
    if (newEmail.trim()) {
      updateSkipTracedContacts(parcelId, 'email', [...emailDetails, { value: newEmail.trim(), primary: emailDetails.length === 0 }])
      setNewEmail(''); refreshSkipTrace(); scheduleSync()
    }
  }

  const deletePhone = (idx) => {
    updateSkipTracedContacts(parcelId, 'phone', phoneDetails.filter((_, i) => i !== idx))
    refreshSkipTrace(); scheduleSync()
  }

  const deleteEmail = (idx) => {
    updateSkipTracedContacts(parcelId, 'email', emailDetails.filter((_, i) => i !== idx))
    refreshSkipTrace(); scheduleSync()
  }

  const togglePrimary = (type, value) => {
    updateContactMeta(parcelId, type, value, { primary: true }); refreshSkipTrace(); scheduleSync()
  }

  return {
    normalized, address, ownerName, ownerOccupied, age, quickStats,
    categorizedProps, listsWithParcel,
    phoneDetails, emailDetails, skipTracedInfo,
    note, setNote, isEditingNote, setIsEditingNote, handleSaveNote, handleCancelNote,
    editContacts, setEditContacts, newPhone, setNewPhone, newEmail, setNewEmail,
    callerIdDraft, setCallerIdDraft,
    addPhone, addEmail, deletePhone, deleteEmail, togglePrimary,
    handleSetVerified, cycleVerified, handleCallerIdBlur, normalizePhoneNumber,
    handleClose, containerRef, scrollContainerRef, parcelId, refreshSkipTrace, scheduleSync,
  }
}
