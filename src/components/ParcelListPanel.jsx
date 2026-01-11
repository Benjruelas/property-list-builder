import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, X, MapPin, ChevronRight, ChevronDown, Trash2, Info, Phone } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { cn } from '@/lib/utils'
import { isParcelSkipTraced } from '@/utils/skipTrace'

export function ParcelListPanel({ 
  isOpen, 
  onClose, 
  selectedListId,
  publicLists,
  onCenterParcel,
  onBack,
  onRemoveParcel,
  onOpenParcelDetails,
  onSkipTraceParcel,
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

    let list = null

    // Check if it's a public list
    if (selectedListId.startsWith('public_')) {
      list = publicLists?.find(l => l.id === selectedListId)
    } else {
      // Private list - load from localStorage
      const stored = localStorage.getItem('property_lists')
      if (stored) {
        try {
          const lists = JSON.parse(stored)
          list = lists.find(l => l.id === selectedListId)
        } catch (error) {
          console.error('Error loading list:', error)
        }
      }
    }

    if (list) {
      setListName(list.name)
      // Parcels are stored as objects with id and potentially properties
      setParcels(list.parcels || [])
    } else {
      setParcels([])
      setListName('')
    }
  }, [selectedListId, isOpen, publicLists, refreshTrigger])

  // Reload parcels after removal
  const handleRemoveParcel = async (listId, parcelId, isPublic) => {
    if (onRemoveParcel) {
      await onRemoveParcel(listId, parcelId, isPublic)
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
      <DialogContent className="max-w-2xl max-h-[80vh] p-0" showCloseButton={false}>
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
          </div>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-200px)]">
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
                      <div className="px-3 pb-3 space-y-2 border-t bg-gray-50 relative">
                        {onRemoveParcel && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 text-gray-500 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              const isPublic = selectedListId?.startsWith('public_')
                              handleRemoveParcel(selectedListId, parcelId, isPublic)
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
                        <div className="flex flex-wrap gap-2 mt-2">
                          {onOpenParcelDetails && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-w-[120px]"
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
                                    "flex items-center gap-2 px-3 py-2 rounded-md border text-sm",
                                    hasSkipTraced ? "bg-green-50 text-green-700 border-green-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"
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
                                  className="flex-1 min-w-[120px]"
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
                              className="flex-1 min-w-[120px]"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCenterParcel(parcel)
                              }}
                            >
                              <MapPin className="h-4 w-4 mr-2" />
                              Center on Map
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

