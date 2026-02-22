import React, { useEffect, useState } from 'react'
import { X, MapPin, Home, DollarSign, Info, Phone, Mail, FileText, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { getSkipTracedParcel } from '@/utils/skipTrace'
import { getParcelNote, saveParcelNote } from '@/utils/parcelNotes'

/**
 * ParcelDetails component - Displays all available parcel data in a nice format
 */
export function ParcelDetails({ isOpen, onClose, parcelData, onEmailClick, lists = [] }) {
  // Hooks must be called before any early returns
  // Use state to track skip trace info and refresh when dialog opens or parcelData changes
  const [skipTracedInfo, setSkipTracedInfo] = useState(null)
  const [note, setNote] = useState('')
  const [isEditingNote, setIsEditingNote] = useState(false)
  
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

  // Contact information (from skip tracing)
  const contactInfo = skipTracedInfo ? [
    // Primary phone
    ...(skipTracedInfo.phone ? [{ label: 'Phone', value: skipTracedInfo.phone, icon: <Phone className="h-4 w-4" />, isPhone: true }] : []),
    // All phone numbers (if more than just primary)
    ...(skipTracedInfo.phoneNumbers && skipTracedInfo.phoneNumbers.length > 1 
      ? skipTracedInfo.phoneNumbers.slice(1).map((phone, idx) => ({ 
          label: `Phone ${idx + 2}`, 
          value: phone, 
          icon: <Phone className="h-4 w-4" />,
          isPhone: true
        }))
      : []),
    // Primary email
    ...(skipTracedInfo.email ? [{ label: 'Email', value: skipTracedInfo.email, icon: <Mail className="h-4 w-4" />, isPhone: false, isEmail: true }] : []),
    // All emails (if more than just primary)
    ...(skipTracedInfo.emails && skipTracedInfo.emails.length > 1 
      ? skipTracedInfo.emails.slice(1).map((email, idx) => ({ 
          label: `Email ${idx + 2}`, 
          value: email, 
          icon: <Mail className="h-4 w-4" />,
          isPhone: false,
          isEmail: true
        })) 
      : []),
    // Mailing address
    ...(skipTracedInfo.address ? [{ label: 'Mailing Address', value: skipTracedInfo.address, isPhone: false }] : []),
    // Skip traced date
    ...(skipTracedInfo.skipTracedAt ? [{ label: 'Skip Traced On', value: new Date(skipTracedInfo.skipTracedAt).toLocaleDateString(), isPhone: false }] : []),
  ] : []

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

  // Helper to normalize phone number for tel: links (remove formatting, keep digits and +)
  const normalizePhoneNumber = (phone) => {
    if (!phone) return ''
    // Remove all non-digit characters except +
    return phone.replace(/[^\d+]/g, '')
  }

  // Helper to render contact info row (with icon support)
  const renderContactRow = (item) => {
    if (!item.value) return null
    
    const isPhone = item.isPhone === true
    const isEmail = item.isEmail === true
    const phoneLink = isPhone ? `tel:${normalizePhoneNumber(item.value)}` : null
    
    return (
      <div key={item.label} className="flex justify-between items-center py-2 border-b border-white/30 last:border-0">
        <div className="flex items-center gap-2">
          {item.icon && <span className="text-gray-500">{item.icon}</span>}
          <span className="font-semibold text-gray-700">{item.label}:</span>
        </div>
        {isPhone && phoneLink ? (
          <a 
            href={phoneLink}
            className="text-blue-600 hover:text-blue-700 hover:underline text-right flex-1 ml-4"
          >
            {item.value}
          </a>
        ) : isEmail && onEmailClick ? (
          <button
            onClick={() => onEmailClick(item.value, parcelData)}
            className="text-sky-300 hover:text-sky-200 hover:underline text-right flex-1 ml-4 cursor-pointer"
          >
            {item.value}
          </button>
        ) : (
          <span className="text-gray-900 text-right flex-1 ml-4">{item.value}</span>
        )}
      </div>
    )
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
                {contactInfo.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
                      <Phone className="h-5 w-5" />
                      <span>Contact Information</span>
                    </div>
                    <div className="space-y-0">
                      {contactInfo.map(renderContactRow)}
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

