import React, { useEffect, useState } from 'react'
import { X, MapPin, Home, DollarSign, Info, Phone, Mail, FileText, Plus, CheckCircle, XCircle, HelpCircle, User, Pencil, Star, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { getSkipTracedParcel, updateContactMeta, updateSkipTracedContacts } from '@/utils/skipTrace'
import { getParcelNote, saveParcelNote } from '@/utils/parcelNotes'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

/**
 * ParcelDetails component - Displays all available parcel data in a nice format
 */
export function ParcelDetails({ isOpen, onClose, parcelData, onEmailClick, lists = [] }) {
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

  const refreshSkipTrace = () => {
    if (parcelId) setSkipTracedInfo(getSkipTracedParcel(parcelId))
  }

  // Get skip traced contact info
  // Try multiple ID formats to ensure we find the skip trace data
  const parcelId = parcelData?.id || parcelData?.properties?.PROP_ID
  
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

  // Early return after hooks
  if (!parcelData) return null

  const properties = parcelData.properties || {}
  const address = parcelData.address || 
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

  const basicInfo = [
    { label: 'Property ID', value: properties.PROP_ID },
    { label: 'Address', value: address },
    { label: 'Owner', value: properties.OWNER_NAME },
    { label: 'Land Use', value: properties.LOC_LAND_U },
    { label: 'In lists', value: listsWithParcel.length > 0 ? listsWithParcel.map(l => l.name).join(', ') : 'None' },
  ]

  // Contact information (from skip tracing) - use phoneDetails/emailDetails when available
  const phoneDetails = skipTracedInfo?.phoneDetails || (skipTracedInfo?.phoneNumbers?.length ? skipTracedInfo.phoneNumbers.map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 })) : [])
  const emailDetails = skipTracedInfo?.emailDetails || (skipTracedInfo?.emails?.length ? skipTracedInfo.emails.map((v, i) => ({ value: v, verified: null, primary: i === 0 })) : [])

  const propertyDetails = [
    { label: 'Year Built', value: properties.YEAR_BUILT },
    { label: 'Age', value: age ? `${age} years` : null },
    { label: 'Square Feet', value: properties.SQFT ? properties.SQFT.toLocaleString() : null },
    { label: 'Acres', value: properties.ACRES },
    { label: 'Bedrooms', value: properties.BEDROOMS },
    { label: 'Bathrooms', value: properties.BATHROOMS },
  ]

  const financialInfo = [
    { label: 'Total Value', value: properties.TOTAL_VALUE ? `$${properties.TOTAL_VALUE.toLocaleString()}` : null },
    { label: 'Land Value', value: properties.LAND_VALUE ? `$${properties.LAND_VALUE.toLocaleString()}` : null },
    { label: 'Improvement Value', value: properties.IMPROVEMENT_VALUE ? `$${properties.IMPROVEMENT_VALUE.toLocaleString()}` : null },
  ]

  const locationInfo = [
    { label: 'Latitude', value: parcelData.lat ? parcelData.lat.toFixed(6) : null },
    { label: 'Longitude', value: parcelData.lng ? parcelData.lng.toFixed(6) : null },
  ]

  // Helper to render a property row
  const renderPropertyRow = (item) => {
    if (!item.value) return null
    return (
      <div key={item.label} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
        <span className="font-semibold text-gray-700">{item.label}:</span>
        <span className="text-gray-900 text-right flex-1 ml-4">{item.value}</span>
      </div>
    )
  }

  // Helper to render a section
  const renderSection = (title, icon, items) => {
    const filteredItems = items.filter(item => item.value)
    if (filteredItems.length === 0) return null

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
          {icon}
          <span>{title}</span>
        </div>
        <div className="space-y-0">
          {filteredItems.map(renderPropertyRow)}
        </div>
      </div>
    )
  }

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
        className="map-panel max-w-2xl max-h-[80vh] p-0 gap-0"
        showCloseButton={false}
        hideOverlay
        onInteractOutside={(e) => {
          e.preventDefault()
          handleClose(false)
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200">
          <DialogDescription className="sr-only">View and edit parcel details, contact information, and notes</DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              <MapPin className="h-5 w-5 text-gray-600" />
              Parcel Details
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => handleClose(true)} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="parcel-details-scroll px-6 py-4 overflow-y-auto max-h-[calc(80vh-140px)] space-y-6">
                {/* Basic Information */}
                {renderSection('Basic Information', <Info className="h-5 w-5" />, basicInfo)}

                {/* Contact Information (from skip tracing) */}
                {(phoneDetails.length > 0 || emailDetails.length > 0 || skipTracedInfo?.address || skipTracedInfo?.skipTracedAt) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
                      <Phone className="h-5 w-5" />
                      <span>Contact Information</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 ml-auto"
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
                              <a href={`tel:${normalizePhoneNumber(p.value)}`} className="text-blue-600 hover:text-blue-700 hover:underline truncate">
                                {p.value}
                              </a>
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
                              <button onClick={() => onEmailClick(e.value, parcelData)} className="text-sky-300 hover:text-sky-200 hover:underline truncate">
                                {e.value}
                              </button>
                            ) : (
                              <span className="text-gray-900 truncate">{e.value}</span>
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

                {/* Property Details */}
                {renderSection('Property Details', <Home className="h-5 w-5" />, propertyDetails)}

                {/* Financial Information */}
                {renderSection('Financial Information', <DollarSign className="h-5 w-5" />, financialInfo)}

                {/* Location Information */}
                {renderSection('Location', <MapPin className="h-5 w-5" />, locationInfo)}

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

          {/* Display any additional properties that aren't in our predefined categories */}
          <div className="pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-500">
                <p className="font-semibold mb-2">All Properties:</p>
                <div className="parcel-details-scroll grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {Object.entries(properties)
                    .filter(([key]) => 
                      !['PROP_ID', 'SITUS_ADDR', 'SITE_ADDR', 'ADDRESS', 'OWNER_NAME', 'LOC_LAND_U', 
                        'YEAR_BUILT', 'SQFT', 'ACRES', 'BEDROOMS', 'BATHROOMS', 
                        'TOTAL_VALUE', 'LAND_VALUE', 'IMPROVEMENT_VALUE'].includes(key)
                    )
                  .map(([key, value]) => (
                    <div key={key} className="text-xs">
                      <span className="font-medium text-gray-600">{key}:</span>{' '}
                      <span className="text-gray-800">{String(value || 'N/A')}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

