import React, { useEffect, useState, useRef } from 'react'
import { X, MapPin, Home, DollarSign, Info, Phone, Mail, FileText, Plus, CheckCircle, XCircle, HelpCircle, User, Pencil, Star, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { getSkipTracedParcel, updateContactMeta, updateSkipTracedContacts } from '@/utils/skipTrace'
import { getParcelNote, saveParcelNote } from '@/utils/parcelNotes'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

/**
 * Normalize parcel data from any source (map click, list, skip traced list) to a consistent format.
 * Ensures ParcelDetails displays the same regardless of entry point.
 */
function normalizeParcelForDetails(raw) {
  if (!raw) return null
  const props = { ...(raw.properties || {}) }
  // Merge top-level keys that look like property fields (e.g. from skip traced list where parcel has assessor keys at root)
  const propertyLikeKeys = ['PROP_ID', 'PROPID', 'SITUS_ADDR', 'SITE_ADDR', 'ADDRESS', 'OWNER_NAME', 'OWNER', 'OWNERNME1', 'YEAR_BUILT', 'YEARBLT', 'SQFT', 'ACRES', 'TOTAL_VALUE', 'LATITUDE', 'LONGITUDE', 'LAT', 'LNG', 'LON', 'LOC_LAND_U', 'LAND_USE', 'MAIL_ADDR', 'LEGAL_DESC', 'BEDROOMS', 'BATHROOMS', 'COUNTY', 'ZIP', 'STATE', 'CITY', 'MAIL_CITY', 'MAIL_STATE', 'MAIL_ZIP', 'PROP_CLASS', 'SUBDIVISION', 'LOT', 'BLOCK', 'ZONING']
  for (const key of propertyLikeKeys) {
    if (raw[key] != null && raw[key] !== '' && !(key in props)) {
      props[key] = raw[key]
    }
  }
  const id = raw.id || raw.properties?.PROP_ID || raw.PROP_ID || raw.PROPID
  const address = raw.address || props.SITUS_ADDR || props.SITE_ADDR || props.ADDRESS || 'No address available'
  const lat = raw.lat ?? raw.latlng?.lat ?? props.LATITUDE ?? props.LAT
  const lng = raw.lng ?? raw.latlng?.lng ?? props.LONGITUDE ?? props.LNG ?? props.LON
  return { id, properties: props, address, lat: lat != null ? parseFloat(lat) : null, lng: lng != null ? parseFloat(lng) : null }
}

/**
 * ParcelDetails component - Displays all available parcel data in a nice format
 */
export function ParcelDetails({ isOpen, onClose, parcelData, onEmailClick, onPhoneClick, lists = [], enableAutoClose = true }) {
  const { scheduleSync } = useUserDataSync()
  // Hooks must be called before any early returns
  // Use state to track skip trace info and refresh when dialog opens or parcelData changes
  const [skipTracedInfo, setSkipTracedInfo] = useState(null)
  const [note, setNote] = useState('')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [callerIdDraft, setCallerIdDraft] = useState({}) // { "phoneValue": "draft" }
  const [editContacts, setEditContacts] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const containerRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const inactivityTimeoutRef = useRef(null)

  // Parcel ID for skip trace lookups - try multiple formats
  const parcelId = parcelData?.id || parcelData?.properties?.PROP_ID || parcelData?.PROP_ID || parcelData?.PROPID

  const refreshSkipTrace = () => {
    if (parcelId) setSkipTracedInfo(getSkipTracedParcel(parcelId))
  }

  // Re-read skip trace data when dialog opens or parcelData changes
  useEffect(() => {
    if (isOpen && parcelId) {
      const info = getSkipTracedParcel(parcelId)
      setSkipTracedInfo(info)
      
      // Load parcel note
      const savedNote = getParcelNote(parcelId)
      setNote(savedNote || '')
      setIsEditingNote(false)
      
      // Also re-read after a short delay to catch async updates
      const timeout = setTimeout(() => {
        const updatedInfo = getSkipTracedParcel(parcelId)
        setSkipTracedInfo(updatedInfo)
      }, 500)
      
      return () => clearTimeout(timeout)
    }
  }, [isOpen, parcelId, parcelData])

  // Auto-close after 5 seconds of inactivity (only when opened from map popup)
  useEffect(() => {
    if (!enableAutoClose || !isOpen || !onClose) return
    const resetTimer = () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current)
      inactivityTimeoutRef.current = setTimeout(() => {
        if (typeof onClose === 'function') onClose({ reopenPopup: false })
      }, 5000)
    }
    const handleInteraction = (e) => {
      if (containerRef.current?.contains(e.target)) {
        resetTimer()
      }
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

  // Normalize parcel data so display is identical whether opened from map or list
  const normalized = normalizeParcelForDetails(parcelData)
  if (!normalized) return null

  // Handle saving note
  const handleSaveNote = () => {
    if (parcelId) {
      saveParcelNote(parcelId, note)
      setIsEditingNote(false)
      scheduleSync()
    }
  }

  // Handle canceling note edit
  const handleCancelNote = () => {
    if (parcelId) {
      const savedNote = getParcelNote(parcelId)
      setNote(savedNote || '')
      setIsEditingNote(false)
    }
  }

  const properties = normalized.properties || {}
  const address = normalized.address ||
                  properties.SITUS_ADDR ||
                  properties.SITE_ADDR ||
                  properties.ADDRESS ||
                  'No address available'

  // Calculate age (Current Year - Year Built)
  const currentYear = new Date().getFullYear()
  const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
  const age = yearBuilt ? currentYear - yearBuilt : null

  // Group properties by category
  const listsWithParcel = lists.filter(l =>
    (l.parcels || []).some(p => (p.id || p.properties?.PROP_ID || p) === parcelId)
  )

  // Contact information (from skip tracing) - use phoneDetails/emailDetails when available
  const phoneDetails = skipTracedInfo?.phoneDetails || (skipTracedInfo?.phoneNumbers?.length ? skipTracedInfo.phoneNumbers.map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 })) : [])
  const emailDetails = skipTracedInfo?.emailDetails || (skipTracedInfo?.emails?.length ? skipTracedInfo.emails.map((v, i) => ({ value: v, verified: null, primary: i === 0 })) : [])

  // Property key -> human-readable label (comprehensive for parcel/cadastral data)
  const PROPERTY_LABELS = {
    PROP_ID: 'Property ID', PROPID: 'Property ID', PARCEL_ID: 'Parcel ID', PIN: 'Parcel Number', APN: 'Assessor Parcel Number',
    SITUS_ADDR: 'Site Address', SITE_ADDR: 'Street Address', ADDRESS: 'Address', ADDR: 'Address',
    SITUS: 'Situs Address', SITEADRESS: 'Site Address', SITEADDRESS: 'Site Address',
    OWNER_NAME: 'Owner', OWNER: 'Owner', OWNERNME1: 'Owner Name', MAIL_OWNER: 'Mailing Owner',
    LOC_LAND_U: 'Land Use', LAND_USE: 'Land Use', LAND_USE_CODE: 'Land Use Code', LAND_USE_CLASS: 'Land Use Class',
    PROP_CLASS: 'Property Class', PROPCLASS: 'Property Class', PROPERTY_CLASS: 'Property Class',
    YEAR_BUILT: 'Year Built', YEARBLT: 'Year Built',
    SQFT: 'Square Feet', SQ_FT: 'Square Feet', BLDG_SQFT: 'Building Square Feet', LIVING_SQFT: 'Living Square Feet',
    ACRES: 'Acres', ACREAGE: 'Acreage', ASSDACRES: 'Assessed Acres',
    BEDROOMS: 'Bedrooms', BEDROOM: 'Bedrooms', BEDS: 'Bedrooms',
    BATHROOMS: 'Bathrooms', BATHROOM: 'Bathrooms', BATHS: 'Bathrooms',
    TOTAL_VALUE: 'Total Value', ASSESSED_VALUE: 'Assessed Value', MRKT_VAL_TOT: 'Market Value',
    LAND_VALUE: 'Land Value', LNDVALUE: 'Land Value', MRKT_VAL_LAND: 'Land Market Value',
    IMPROVEMENT_VALUE: 'Improvement Value', IMPVALUE: 'Improvement Value', MRKT_VAL_BLDG: 'Building Value',
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
    ZONING: 'Zoning', ZONING_CODE: 'Zoning Code',
    COUNTY: 'County', COUNTY_NAME: 'County', CONAME: 'County',
    TAX_YEAR: 'Tax Year', TAXROLLYEAR: 'Tax Year', ASMT_LEVYR: 'Assessment Year',
    SCITY: 'City', ADDR_LINE1: 'Address Line 1', STREET: 'Street',
  }

  const formatValue = (key, value) => {
    if (value === null || value === undefined || value === '') return null
    const str = String(value).trim()
    if (!str) return null
    const upperKey = (key || '').toUpperCase()
    if (['TOTAL_VALUE', 'LAND_VALUE', 'IMPROVEMENT_VALUE', 'ASSESSED_VALUE', 'LNDVALUE', 'IMPVALUE', 'MRKT_VAL_TOT', 'MRKT_VAL_LAND', 'MRKT_VAL_BLDG'].includes(upperKey)) {
      const num = parseFloat(String(value).replace(/[$,]/g, ''))
      if (!isNaN(num)) return `$${num.toLocaleString()}`
    }
    if (['SQFT', 'SQ_FT', 'BLDG_SQFT', 'LIVING_SQFT'].includes(upperKey)) {
      const num = parseFloat(String(value).replace(/,/g, ''))
      if (!isNaN(num)) return num.toLocaleString()
    }
    if (['ACRES', 'ACREAGE', 'ASSDACRES'].includes(upperKey)) {
      const num = parseFloat(value)
      if (!isNaN(num)) return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
    }
    return str
  }

  const keyToLabel = (key) => PROPERTY_LABELS[key] || PROPERTY_LABELS[key?.toUpperCase()] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const CATEGORIES = {
    identification: { title: 'Identification', icon: Info, keys: ['PROP_ID', 'PROPID', 'PARCEL_ID', 'PIN', 'APN', 'TAXPARCELID', 'ACCOUNT'] },
    address: { title: 'Address', icon: MapPin, keys: ['SITUS_ADDR', 'SITE_ADDR', 'ADDRESS', 'ADDR', 'SITUS', 'SITEADRESS', 'SITEADDRESS', 'ADDR_LINE1', 'STREET', 'SITUS_CITY', 'PROP_CITY', 'CITY', 'SITUS_STATE', 'PROP_STATE', 'STATE', 'state2', 'SITUS_ZIP', 'PROP_ZIP', 'ZIP', 'ZIP_CODE', 'szip', 'szip5'] },
    ownership: { title: 'Ownership', icon: User, keys: ['OWNER_NAME', 'OWNER', 'OWNERNME1', 'MAIL_OWNER'] },
    property: { title: 'Property Characteristics', icon: Home, keys: ['LOC_LAND_U', 'LAND_USE', 'LAND_USE_CODE', 'LAND_USE_CLASS', 'PROP_CLASS', 'PROPCLASS', 'PROPERTY_CLASS', 'YEAR_BUILT', 'YEARBLT', 'SQFT', 'SQ_FT', 'BLDG_SQFT', 'LIVING_SQFT', 'ACRES', 'ACREAGE', 'ASSDACRES', 'BEDROOMS', 'BEDROOM', 'BEDS', 'BATHROOMS', 'BATHROOM', 'BATHS', 'ZONING', 'ZONING_CODE'] },
    valuation: { title: 'Valuation', icon: DollarSign, keys: ['TOTAL_VALUE', 'ASSESSED_VALUE', 'MRKT_VAL_TOT', 'LAND_VALUE', 'LNDVALUE', 'MRKT_VAL_LAND', 'IMPROVEMENT_VALUE', 'IMPVALUE', 'MRKT_VAL_BLDG', 'TAX_YEAR', 'TAXROLLYEAR', 'ASMT_LEVYR'] },
    location: { title: 'Location', icon: MapPin, keys: ['LATITUDE', 'LAT', 'LONGITUDE', 'LNG', 'LON', 'COUNTY', 'COUNTY_NAME', 'CONAME'] },
    mailing: { title: 'Mailing Address', icon: Mail, keys: ['MAIL_ADDR', 'MAILING_ADDR', 'PSTLADRESS', 'MAIL_CITY', 'MAIL_STATE', 'MAIL_ZIP'] },
    legal: { title: 'Legal & Lot', icon: FileText, keys: ['LEGAL_DESC', 'LEGAL_DESCRIP', 'SUBDIVISION', 'SUBDIV', 'LOT', 'LOT_NUM', 'BLOCK', 'BLOCK_NUM'] },
  }

  const keyToCategory = {}
  Object.entries(CATEGORIES).forEach(([cat, { keys }]) => keys.forEach(k => { keyToCategory[k] = cat }))

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
      const cat = keyToCategory[key] || keyToCategory[key?.toUpperCase()] || 'other'
      addToList(cat, key, value)
    })
    if (normalized.lat != null || normalized.lng != null) {
      if (normalized.lat != null && !seen.has('LATITUDE')) addToList('location', 'LATITUDE', normalized.lat)
      if (normalized.lng != null && !seen.has('LONGITUDE')) addToList('location', 'LONGITUDE', normalized.lng)
    }
    if (address && result.address.length === 0) {
      addToList('address', 'ADDRESS', address)
    }
    addToList('ownership', 'In lists', listsWithParcel.length > 0 ? listsWithParcel.map(l => l.name).join(', ') : null)
    if (age != null) addToList('property', 'Age', `${age} years`)
    return result
  }

  const categorizedProps = buildCategorizedProperties()

  // Helper to normalize phone number for tel: links
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

  const VerifiedIcon = ({ verified, onClick, title }) => {
    if (verified === 'good') return <CheckCircle className="h-4 w-4 text-green-600 cursor-pointer hover:opacity-80" onClick={onClick} title={title || 'Verified good - click to change'} />
    if (verified === 'bad') return <XCircle className="h-4 w-4 text-red-600 cursor-pointer hover:opacity-80" onClick={onClick} title={title || 'Verified bad - click to change'} />
    return <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-gray-600" onClick={onClick} title={title || 'Unverified - click to mark'} />
  }

  const handleClose = (reopenPopup) => {
    if (typeof onClose === 'function') onClose({ reopenPopup })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && typeof onClose === 'function') onClose({ reopenPopup: false })
    }}>
      <DialogContent
        className="map-panel parcel-details-panel max-w-2xl max-h-[80vh] p-0 gap-0"
        showCloseButton={false}
        hideOverlay
        onInteractOutside={(e) => {
          e.preventDefault()
          handleClose(false)
        }}
      >
        <div ref={containerRef} className="contents">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200">
          <DialogDescription className="sr-only">View and edit parcel details, contact information, and notes</DialogDescription>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold truncate">
              Parcel Details
            </DialogTitle>
            <div className="map-panel-header-actions">
              <Button variant="ghost" size="icon" onClick={() => handleClose(true)} title="Close" className="parcel-details-close-btn">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div ref={scrollContainerRef} className="parcel-details-scroll px-6 py-4 overflow-y-auto max-h-[calc(80vh-140px)] space-y-6">
                {/* Categorized property sections */}
                {(['identification', 'address', 'ownership', 'property', 'valuation', 'location', 'mailing', 'legal', 'other']).map(catKey => {
                  const items = categorizedProps[catKey]
                  if (!items?.length) return null
                  const { title, icon: Icon } = catKey === 'other' ? { title: 'Other Properties', icon: Info } : CATEGORIES[catKey]
                  return (
                    <div key={catKey} className="space-y-2">
                      <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
                        <Icon className="h-5 w-5" />
                        <span>{title}</span>
                      </div>
                      <div className="space-y-0">
                        {items.map(({ key, label, value }) => (
                          <div key={key} className="flex justify-between py-2 border-b border-gray-100 last:border-0 gap-4">
                            <span className="font-semibold text-gray-700 shrink-0">{label}:</span>
                            <span className="text-gray-900 text-right break-words">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Contact Information (from skip tracing) */}
                {(phoneDetails.length > 0 || emailDetails.length > 0 || skipTracedInfo?.address || skipTracedInfo?.skipTracedAt) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
                      <Phone className="h-5 w-5" />
                      <span>Contact Information</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="parcel-details-edit-btn h-7 px-2 ml-auto"
                        onClick={() => { setEditContacts((e) => !e); setNewPhone(''); setNewEmail('') }}
                        title={editContacts ? 'Done editing' : 'Edit contacts'}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-0">
                      {phoneDetails.map((p, idx) => (
                        <div key={`phone-${idx}`} className="py-2 border-b border-white/30 last:border-0 space-y-1">
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {editContacts ? (
                                <button
                                  type="button"
                                  onClick={() => { updateContactMeta(parcelId, 'phone', p.value, { primary: !p.primary }); refreshSkipTrace(); scheduleSync() }}
                                  title={p.primary ? 'Remove from primary' : 'Set as primary'}
                                  className="text-amber-500 hover:text-amber-600 flex-shrink-0"
                                >
                                  {p.primary ? <Star className="h-4 w-4 fill-current" /> : <Star className="h-4 w-4" />}
                                </button>
                              ) : (
                                p.primary && <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" title="Primary" />
                              )}
                              <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
                              <span className="font-semibold text-gray-700">{phoneDetails.length > 1 ? `Phone ${idx + 1}:` : 'Phone:'}</span>
                              <VerifiedIcon verified={p.verified} onClick={() => handleSetVerified('phone', p.value, cycleVerified(p.verified))} />
                            </div>
                            <div className="flex items-center gap-1">
                              {onPhoneClick ? (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onPhoneClick(p.value, normalized) }}
                                  className="parcel-details-link-btn text-inherit hover:underline truncate text-left"
                                >
                                  {p.value}
                                </button>
                              ) : (
                                <a href={`tel:${normalizePhoneNumber(p.value)}`} className="parcel-details-link-btn text-inherit hover:underline truncate">
                                  {p.value}
                                </a>
                              )}
                              {editContacts && (
                                <button
                                  type="button"
                                  onClick={() => { updateSkipTracedContacts(parcelId, 'phone', phoneDetails.filter((_, i) => i !== idx)); refreshSkipTrace(); scheduleSync() }}
                                  className="text-red-500 hover:text-red-600 p-0.5 flex-shrink-0"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {editContacts ? (
                            (p.callerId && String(p.callerId).trim()) || callerIdDraft[p.value] !== undefined ? (
                              <div className="flex items-center gap-2 pl-6">
                                <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                <Input
                                  placeholder="Caller ID"
                                  value={callerIdDraft[p.value] !== undefined ? callerIdDraft[p.value] : (p.callerId || '')}
                                  onChange={(e) => setCallerIdDraft(prev => ({ ...prev, [p.value]: e.target.value }))}
                                  onBlur={(e) => handleCallerIdBlur(p.value, e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                  className="h-8 text-sm flex-1 max-w-[200px]"
                                />
                              </div>
                            ) : (
                              <div className="pl-6 py-1">
                                <button
                                  type="button"
                                  onClick={() => setCallerIdDraft(prev => ({ ...prev, [p.value]: '' }))}
                                  className="parcel-details-link-btn text-sm text-gray-500 hover:text-gray-700 underline"
                                >
                                  Add caller ID
                                </button>
                              </div>
                            )
                          ) : (p.callerId && String(p.callerId).trim()) ? (
                            <div className="flex items-center gap-2 pl-6 py-1">
                              <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700">Caller ID: {(p.callerId || '').trim()}</span>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {editContacts && (
                        <div className="flex items-center gap-2 py-2">
                          <input
                            type="tel"
                            placeholder="Add phone"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            className="border rounded px-2 py-1 text-sm flex-1"
                            onKeyDown={(e) => { if (e.key === 'Enter') { updateSkipTracedContacts(parcelId, 'phone', [...phoneDetails, { value: newPhone.trim(), primary: phoneDetails.length === 0 }]); setNewPhone(''); refreshSkipTrace(); scheduleSync() } }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => { if (newPhone.trim()) { updateSkipTracedContacts(parcelId, 'phone', [...phoneDetails, { value: newPhone.trim(), primary: phoneDetails.length === 0 }]); setNewPhone(''); refreshSkipTrace(); scheduleSync() } }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {emailDetails.map((e, idx) => (
                        <div key={`email-${idx}`} className="flex justify-between items-center py-2 border-b border-white/30 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {editContacts ? (
                              <button
                                type="button"
                                onClick={() => { updateContactMeta(parcelId, 'email', e.value, { primary: !e.primary }); refreshSkipTrace(); scheduleSync() }}
                                title={e.primary ? 'Remove from primary' : 'Set as primary'}
                                className="text-amber-500 hover:text-amber-600 flex-shrink-0"
                              >
                                {e.primary ? <Star className="h-4 w-4 fill-current" /> : <Star className="h-4 w-4" />}
                              </button>
                            ) : (
                              e.primary && <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" title="Primary" />
                            )}
                            <Mail className="h-4 w-4 text-gray-500 flex-shrink-0" />
                            <span className="font-semibold text-gray-700">{emailDetails.length > 1 ? `Email ${idx + 1}:` : 'Email:'}</span>
                            <VerifiedIcon verified={e.verified} onClick={() => handleSetVerified('email', e.value, cycleVerified(e.verified))} />
                          </div>
                          <div className="flex items-center gap-1">
                            {onEmailClick ? (
                              <button onClick={() => onEmailClick(e.value, normalized)} className="parcel-details-link-btn text-inherit hover:underline truncate">
                                {e.value}
                              </button>
                            ) : (
                              <span className="truncate">{e.value}</span>
                            )}
                            {editContacts && (
                              <button
                                type="button"
                                onClick={() => { updateSkipTracedContacts(parcelId, 'email', emailDetails.filter((_, i) => i !== idx)); refreshSkipTrace(); scheduleSync() }}
                                className="text-red-500 hover:text-red-600 p-0.5 flex-shrink-0"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {editContacts && (
                        <div className="flex items-center gap-2 py-2">
                          <input
                            type="email"
                            placeholder="Add email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="border rounded px-2 py-1 text-sm flex-1"
                            onKeyDown={(e) => { if (e.key === 'Enter') { updateSkipTracedContacts(parcelId, 'email', [...emailDetails, { value: newEmail.trim(), primary: emailDetails.length === 0 }]); setNewEmail(''); refreshSkipTrace(); scheduleSync() } }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => { if (newEmail.trim()) { updateSkipTracedContacts(parcelId, 'email', [...emailDetails, { value: newEmail.trim(), primary: emailDetails.length === 0 }]); setNewEmail(''); refreshSkipTrace(); scheduleSync() } }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {skipTracedInfo?.address && (
                        <div className="flex justify-between py-2 border-b border-white/30 last:border-0">
                          <span className="font-semibold text-gray-700">Mailing Address:</span>
                          <span className="text-gray-900 text-right flex-1 ml-4">{skipTracedInfo.address}</span>
                        </div>
                      )}
                      {skipTracedInfo?.skipTracedAt && (
                        <div className="flex justify-between py-2 border-b border-white/30 last:border-0">
                          <span className="font-semibold text-gray-700">Skip Traced On:</span>
                          <span className="text-gray-900 text-right flex-1 ml-4">{new Date(skipTracedInfo.skipTracedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      <span>Notes</span>
                    </div>
                    {!isEditingNote && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsEditingNote(true)}
                        className="add-note-btn rounded-xl border-2"
                        title={note ? 'Edit note' : 'Add note'}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {isEditingNote ? (
                    <div className="space-y-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add your notes about this parcel..."
                        className="w-full min-h-[100px] p-3 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-0"
                        rows={4}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelNote}
                          className="rounded-xl border border-white hover:bg-white/20"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleSaveNote}
                          className="rounded-xl"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2">
                      {note ? (
                        <p className="text-gray-900 whitespace-pre-wrap">{note}</p>
                      ) : (
                        <p className="text-gray-400 italic">No notes added yet.</p>
                      )}
                    </div>
                  )}
                </div>

        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

