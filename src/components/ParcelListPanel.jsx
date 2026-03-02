import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, X, MapPin, ChevronRight, ChevronDown, Trash2, Info, Phone, CheckCircle2, Loader2, FileDown, LayoutList, Mail, CheckCircle, XCircle, HelpCircle, Star } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { isParcelSkipTraced, getSkipTracedParcel } from '@/utils/skipTrace'
import { getParcelNote, saveParcelNote } from '@/utils/parcelNotes'
import { isParcelALead } from '@/utils/dealPipeline'

export function ParcelListPanel({ 
  isOpen, 
  onClose, 
  selectedListId,
  lists = [],
  onCenterParcel,
  onBack,
  onRemoveParcel,
  onOpenParcelDetails,
  onPhoneClick,
  onSkipTraceParcel,
  onConvertToLead,
  isParcelALead: isParcelALeadProp,
  onBulkSkipTrace,
  onExportList,
  skipTracingInProgress = new Set()
}) {
  const [expandedParcels, setExpandedParcels] = useState(new Set())
  const [parcels, setParcels] = useState([])
  const [listName, setListName] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0) // Force refresh when changed

  // Load parcels from the selected list
  useEffect(() => {
    if (!selectedListId || !isOpen) {
      setParcels([])
      setListName('')
      return
    }

    const list = lists?.find(l => l.id === selectedListId) ?? null

    if (list) {
      setListName(list.name)
      // Parcels are stored as objects with id and potentially properties
      setParcels(list.parcels || [])
    } else {
      setParcels([])
      setListName('')
    }
  }, [selectedListId, isOpen, lists, refreshTrigger])

  // Reload parcels after removal
  const handleRemoveParcel = async (listId, parcelId) => {
    if (onRemoveParcel) {
      await onRemoveParcel(listId, parcelId)
      // Force refresh by updating trigger - this will cause useEffect to re-run
      // Small delay to ensure state updates have propagated
      setTimeout(() => {
        setRefreshTrigger(prev => prev + 1)
      }, 100)
    }
  }

  // Sort parcels by address (no grouping)
  const sortedParcels = useMemo(() => {
    return [...parcels].sort((a, b) => {
      const addressA = a.properties?.SITUS_ADDR || 
                       a.properties?.SITE_ADDR || 
                       a.properties?.ADDRESS || 
                       a.address ||
                       'No address available'
      const addressB = b.properties?.SITUS_ADDR || 
                       b.properties?.SITE_ADDR || 
                       b.properties?.ADDRESS || 
                       b.address ||
                       'No address available'
      return addressA.localeCompare(addressB)
    })
  }, [parcels])

  const toggleParcel = (parcelId) => {
    setExpandedParcels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(parcelId)) {
        newSet.delete(parcelId)
      } else {
        newSet.add(parcelId)
      }
      return newSet
    })
  }

  const handleCenterParcel = (parcel) => {
    if (onCenterParcel && parcel.properties) {
      // Try to get coordinates from properties or use lat/lng if available
      const lat = parcel.lat || parcel.properties.LATITUDE
      const lng = parcel.lng || parcel.properties.LONGITUDE
      
      if (lat && lng) {
        onCenterParcel({ lat: parseFloat(lat), lng: parseFloat(lng) })
      }
    }
  }

  return (
    <Dialog open={isOpen && !!selectedListId} onOpenChange={(open) => {
      if (!open) {
        if (onBack) {
          onBack()
        } else if (onClose) {
          onClose()
        }
      }
    }}>
      <DialogContent className="map-panel parcel-list-panel max-w-2xl max-h-[80vh] p-0" showCloseButton={false} hideOverlay>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack || onClose}
              title="Back to lists"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle className="flex-1 text-xl font-semibold">
              {listName || 'Parcels'}
            </DialogTitle>
            {onBulkSkipTrace && parcels.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-700 hover:text-green-800"
                onClick={() => onBulkSkipTrace(selectedListId)}
                title="Skip trace all parcels in this list"
              >
                <Phone className="h-4 w-4" />
              </Button>
            )}
            {onExportList && parcels.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-600 hover:text-blue-700"
                onClick={() => onExportList(selectedListId)}
                title="Export list as CSV and email to you"
              >
                <FileDown className="h-4 w-4" />
              </Button>
            )}
          </div>
          <DialogDescription className="sr-only">
            List of parcels in {listName || 'this list'}. Click on a parcel to view details.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(80vh-200px)]">
          {sortedParcels.length === 0 ? (
            <p className="text-center text-gray-500 py-8 text-sm">No parcels in this list yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedParcels.map((parcel) => {
                const parcelId = parcel.id || parcel.properties?.PROP_ID || `parcel-${parcel.addedAt}`
                const isExpanded = expandedParcels.has(parcelId)
                const props = parcel.properties || {}
                const address = parcel.properties?.SITUS_ADDR || 
                               parcel.properties?.SITE_ADDR || 
                               parcel.properties?.ADDRESS || 
                               parcel.address ||
                               'No address available'

                return (
                  <div 
                    key={parcelId} 
                    className={cn(
                      "border rounded-lg transition-all",
                      isExpanded ? "border-blue-500 shadow-md" : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div 
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleParcel(parcelId)}
                    >
                      <span className="font-semibold text-sm text-gray-900 flex-1 truncate">
                        {address}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-500 ml-2 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500 ml-2 flex-shrink-0" />
                      )}
                    </div>
                    
                    {isExpanded && (
                      <div className="parcel-expanded-glass px-3 pb-3 space-y-2 border-t relative">
                        {onRemoveParcel && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 text-gray-500 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveParcel(selectedListId, parcelId)
                            }}
                            title="Remove from List"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {props.OWNER_NAME && (
                          <div className="pt-2 text-sm">
                            <span className="font-semibold text-gray-700">Owner:</span>{' '}
                            <span className="text-gray-900">{props.OWNER_NAME}</span>
                          </div>
                        )}
                        {props.PROP_ID && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Property ID:</span>{' '}
                            <span className="text-gray-900">{props.PROP_ID}</span>
                          </div>
                        )}
                        {props.LOC_LAND_U && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Land Use:</span>{' '}
                            <span className="text-gray-900">{props.LOC_LAND_U}</span>
                          </div>
                        )}
                        {props.ACRES && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Acres:</span>{' '}
                            <span className="text-gray-900">{props.ACRES}</span>
                          </div>
                        )}
                        {props.TOTAL_VALUE && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Total Value:</span>{' '}
                            <span className="text-gray-900">${props.TOTAL_VALUE?.toLocaleString()}</span>
                          </div>
                        )}
                        {props.YEAR_BUILT && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Year Built:</span>{' '}
                            <span className="text-gray-900">{props.YEAR_BUILT}</span>
                          </div>
                        )}
                        {props.SQFT && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Square Feet:</span>{' '}
                            <span className="text-gray-900">{props.SQFT?.toLocaleString()}</span>
                          </div>
                        )}
                        {props.BEDROOMS && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Bedrooms:</span>{' '}
                            <span className="text-gray-900">{props.BEDROOMS}</span>
                          </div>
                        )}
                        {props.BATHROOMS && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Bathrooms:</span>{' '}
                            <span className="text-gray-900">{props.BATHROOMS}</span>
                          </div>
                        )}
                        {parcel.addedAt && (
                          <div className="text-sm">
                            <span className="font-semibold text-gray-700">Added:</span>{' '}
                            <span className="text-gray-900">{new Date(parcel.addedAt).toLocaleDateString()}</span>
                          </div>
                        )}
                        {/* Contact Information (from skip tracing) */}
                        {(() => {
                          const skipTracedInfo = getSkipTracedParcel(parcelId)
                          if (!skipTracedInfo) return null
                          const phoneDetails = skipTracedInfo.phoneDetails || (skipTracedInfo.phoneNumbers || (skipTracedInfo.phone ? [skipTracedInfo.phone] : [])).map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 }))
                          const emailDetails = skipTracedInfo.emailDetails || (skipTracedInfo.emails || (skipTracedInfo.email ? [skipTracedInfo.email] : [])).map((v, i) => ({ value: v, verified: null, primary: i === 0 }))
                          const hasContact = phoneDetails.length > 0 || emailDetails.length > 0 || skipTracedInfo.address || skipTracedInfo.skipTracedAt
                          if (!hasContact) return null

                          const VerifiedBadge = ({ verified }) => {
                            if (verified === 'good') return <CheckCircle className="h-3.5 w-3.5 text-green-600 inline-block ml-0.5" title="Verified good" />
                            if (verified === 'bad') return <XCircle className="h-3.5 w-3.5 text-red-600 inline-block ml-0.5" title="Verified bad" />
                            return <HelpCircle className="h-3.5 w-3.5 text-gray-400 inline-block ml-0.5" title="Unverified" />
                          }

                          return (
                            <div className="pt-2 border-t border-gray-200 mt-2">
                              <div className="text-sm font-semibold text-gray-700 mb-2">Contact Information:</div>
                              {phoneDetails.map((p, idx) => (
                                <div key={idx} className="text-sm flex items-center gap-1">
                                  {p.primary && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 flex-shrink-0" title="Primary" />}
                                  <span className="font-semibold text-gray-700">{phoneDetails.length > 1 ? `Phone ${idx + 1}:` : 'Phone:'}</span>
                                  <VerifiedBadge verified={p.verified} />
                                  {onPhoneClick ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const parcelData = {
                                          id: parcelId,
                                          properties: props,
                                          address,
                                          lat: parcel.lat || props.LATITUDE ? parseFloat(parcel.lat || props.LATITUDE) : null,
                                          lng: parcel.lng || props.LONGITUDE ? parseFloat(parcel.lng || props.LONGITUDE) : null
                                        }
                                        onPhoneClick(p.value, parcelData)
                                      }}
                                      className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                                    >
                                      {p.value}
                                    </button>
                                  ) : (
                                    <a href={`tel:${(p.value || '').replace(/[^\d+]/g, '')}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                                      {p.value}
                                    </a>
                                  )}
                                  {p.callerId && <span className="text-gray-500 text-xs">({p.callerId})</span>}
                                </div>
                              ))}
                              {emailDetails.map((e, idx) => (
                                <div key={idx} className="text-sm flex items-center gap-1">
                                  {e.primary && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 flex-shrink-0" title="Primary" />}
                                  <span className="font-semibold text-gray-700">{emailDetails.length > 1 ? `Email ${idx + 1}:` : 'Email:'}</span>
                                  <VerifiedBadge verified={e.verified} />
                                  <span className="text-gray-900">{e.value}</span>
                                </div>
                              ))}
                              {skipTracedInfo.address && (
                                <div className="text-sm">
                                  <span className="font-semibold text-gray-700">Mailing Address:</span>{' '}
                                  <span className="text-gray-900">{skipTracedInfo.address}</span>
                                </div>
                              )}
                              {skipTracedInfo.skipTracedAt && (
                                <div className="text-sm">
                                  <span className="font-semibold text-gray-700">Skip Traced On:</span>{' '}
                                  <span className="text-gray-900">{new Date(skipTracedInfo.skipTracedAt).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                        {/* Notes Section */}
                        {(() => {
                          const parcelNote = getParcelNote(parcelId)
                          if (!parcelNote) return null
                          
                          return (
                            <div className="pt-2 border-t border-gray-200 mt-2">
                              <div className="text-sm font-semibold text-gray-700 mb-1">Notes:</div>
                              <div className="text-sm text-gray-900 whitespace-pre-wrap parcel-expanded-glass p-2 rounded border border-gray-200/60">
                                {parcelNote}
                              </div>
                            </div>
                          )
                        })()}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {onOpenParcelDetails && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="parcel-dropdown-btn flex-1 min-w-[120px]"
                              onClick={(e) => {
                                e.stopPropagation()
                                // Prepare parcel data in the format expected by ParcelDetails
                                const parcelData = {
                                  id: parcelId,
                                  properties: props,
                                  address: address,
                                  lat: parcel.lat || props.LATITUDE ? parseFloat(parcel.lat || props.LATITUDE) : null,
                                  lng: parcel.lng || props.LONGITUDE ? parseFloat(parcel.lng || props.LONGITUDE) : null
                                }
                                onOpenParcelDetails(parcelData)
                              }}
                            >
                              <Info className="h-4 w-4 mr-2" />
                              More Details
                            </Button>
                          )}
                          {onSkipTraceParcel && (
                            (() => {
                              const hasSkipTraced = isParcelSkipTraced(parcelId)
                              const isInProgress = skipTracingInProgress.has(parcelId)
                              
                              if (hasSkipTraced || isInProgress) {
                                return (
                                  <div className={cn(
                                    "parcel-dropdown-btn flex items-center gap-2 px-3 py-2 rounded-md border text-sm",
                                    hasSkipTraced ? "parcel-dropdown-status-success text-green-700" : "parcel-dropdown-status-pending text-yellow-700"
                                  )}>
                                    {hasSkipTraced ? (
                                      <>
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span>Contact Found</span>
                                      </>
                                    ) : (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>Skip Tracing...</span>
                                      </>
                                    )}
                                  </div>
                                )
                              }
                              
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="parcel-dropdown-btn flex-1 min-w-[120px]"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // Prepare parcel data
                                    const parcelData = {
                                      id: parcelId,
                                      properties: props,
                                      address: address,
                                      lat: parcel.lat || props.LATITUDE ? parseFloat(parcel.lat || props.LATITUDE) : null,
                                      lng: parcel.lng || props.LONGITUDE ? parseFloat(parcel.lng || props.LONGITUDE) : null
                                    }
                                    onSkipTraceParcel(parcelData)
                                    // Refresh after skip trace completes (will need to add callback or refresh trigger)
                                    setTimeout(() => setRefreshTrigger(prev => prev + 1), 3000)
                                  }}
                                >
                                  <Phone className="h-4 w-4 mr-2" />
                                  Get Contact
                                </Button>
                              )
                            })()
                          )}
                          {(parcel.lat && parcel.lng) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="parcel-dropdown-btn flex-1 min-w-[120px]"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCenterParcel(parcel)
                              }}
                            >
                              <MapPin className="h-4 w-4 mr-2" />
                              Center on Map
                            </Button>
                          )}
                          {onConvertToLead && !((isParcelALeadProp ?? isParcelALead)(parcelId)) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="parcel-dropdown-btn flex-1 min-w-[120px]"
                              onClick={(e) => {
                                e.stopPropagation()
                                const parcelData = {
                                  id: parcelId,
                                  properties: props,
                                  address: address,
                                  lat: parcel.lat || props.LATITUDE ? parseFloat(parcel.lat || props.LATITUDE) : null,
                                  lng: parcel.lng || props.LONGITUDE ? parseFloat(parcel.lng || props.LONGITUDE) : null
                                }
                                onConvertToLead(parcelData)
                              }}
                            >
                              <LayoutList className="h-4 w-4 mr-2" />
                              Convert to Lead
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

