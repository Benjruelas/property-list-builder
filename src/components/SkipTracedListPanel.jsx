import { useState, useEffect } from 'react'
import { X, Phone, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { getSkipTracedList } from '../utils/skipTracedList'

export function SkipTracedListPanel({ 
  isOpen, 
  onClose,
  onOpenParcelDetails
}) {
  const [skipTracedList, setSkipTracedList] = useState(null)
  const [expandedSkipTracedLists, setExpandedSkipTracedLists] = useState(new Set())

  // Load skip traced list when panel opens
  useEffect(() => {
    if (isOpen) {
      const skipTraced = getSkipTracedList()
      setSkipTracedList(skipTraced)
      console.log('📋 Loaded skip traced list:', skipTraced)
    } else {
      setSkipTracedList(null)
    }
  }, [isOpen])

  // Poll for localStorage changes when panel is open (since storage event only fires across tabs)
  // This ensures the list updates when parcels/lists are skip traced
  useEffect(() => {
    if (!isOpen) return

    const intervalId = setInterval(() => {
      const skipTraced = getSkipTracedList()
      setSkipTracedList(skipTraced)
    }, 1000) // Check every 1 second when panel is open

    return () => {
      clearInterval(intervalId)
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose()
      }
    }}>
      <DialogContent className="map-panel list-panel fullscreen-panel" showCloseButton={false} hideOverlay>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold truncate">Skiptraced Parcels</DialogTitle>
            <div className="map-panel-header-actions">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">
            List of all parcels and lists that have been skip traced.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {(!skipTracedList || (skipTracedList.parcels.length === 0 && skipTracedList.listItems.length === 0)) ? (
            <p className="text-center py-8 text-sm opacity-80">No skip traced parcels yet.</p>
          ) : (
            <div className="space-y-4">
              {/* Individual skip traced parcels */}
              {skipTracedList.parcels.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 pb-2 border-b border-white/20">
                    <Phone className="h-4 w-4" />
                    Individual Parcels ({skipTracedList.parcels.length})
                  </h3>
                  <div className="space-y-1">
                    {skipTracedList.parcels.map((parcel, index) => {
                      const parcelId = parcel.id || parcel.properties?.PROP_ID || `parcel-${index}`
                      const address = parcel.properties?.SITUS_ADDR || 
                                     parcel.properties?.SITE_ADDR || 
                                     parcel.properties?.ADDRESS || 
                                     parcel.address ||
                                     'No address available'
                      return (
                        <div
                          key={parcelId}
                          className={cn(
                            "flex items-center justify-between p-3 border-2 border-white/20 rounded-lg cursor-pointer transition-colors hover:border-white/30 hover:bg-gray-50"
                          )}
                          onClick={() => {
                            if (onOpenParcelDetails) {
                              // Prepare parcel data in the format expected by ParcelDetails
                              const parcelData = {
                                id: parcelId,
                                properties: parcel.properties || parcel,
                                address: address,
                                lat: parcel.lat || parcel.properties?.LATITUDE ? parseFloat(parcel.lat || parcel.properties?.LATITUDE) : null,
                                lng: parcel.lng || parcel.properties?.LONGITUDE ? parseFloat(parcel.lng || parcel.properties?.LONGITUDE) : null
                              }
                              onOpenParcelDetails(parcelData)
                            }
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{address}</div>
                            <div className="text-xs opacity-75">
                              {parcel.skipTracedAt ? new Date(parcel.skipTracedAt).toLocaleDateString() : ''}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              
              {/* Skip traced lists (expandable) */}
              {skipTracedList.listItems.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 pb-2 border-b border-white/20">
                    <Phone className="h-4 w-4" />
                    Skip Traced Lists ({skipTracedList.listItems.length})
                  </h3>
                  <div className="space-y-1">
                    {skipTracedList.listItems.map((listItem) => {
                      const isExpanded = expandedSkipTracedLists.has(listItem.listId)
                      const parcelCount = listItem.parcels.length
                      
                      return (
                        <div key={listItem.listId} className="border-2 border-white/20 rounded-lg">
                          <div
                            className="flex items-center justify-between p-3 cursor-pointer transition-colors hover:bg-gray-50 rounded-lg"
                            onClick={() => {
                              setExpandedSkipTracedLists(prev => {
                                const next = new Set(prev)
                                if (next.has(listItem.listId)) {
                                  next.delete(listItem.listId)
                                } else {
                                  next.add(listItem.listId)
                                }
                                return next
                              })
                            }}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 opacity-75 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 opacity-75 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{listItem.listName}</div>
                                <div className="text-xs opacity-75">
                                  {parcelCount} parcel{parcelCount !== 1 ? 's' : ''} • {listItem.skipTracedAt ? new Date(listItem.skipTracedAt).toLocaleDateString() : ''}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {isExpanded && (
                                <div className="px-3 pb-3 pt-1 space-y-1 border-t border-white/20 bg-white/5">
                                  {listItem.parcels.map((parcel, index) => {
                                    const parcelId = parcel.id || parcel.properties?.PROP_ID || `parcel-${index}`
                                    const address = parcel.properties?.SITUS_ADDR || 
                                                   parcel.properties?.SITE_ADDR || 
                                                   parcel.properties?.ADDRESS || 
                                                   parcel.address ||
                                                   'No address available'
                                    return (
                                      <div
                                        key={parcelId}
                                        className="flex items-center justify-between p-2 border border-white/20 rounded text-sm cursor-pointer transition-colors hover:border-white/30 hover:bg-gray-50"
                                        onClick={() => {
                                          if (onOpenParcelDetails) {
                                            // Prepare parcel data in the format expected by ParcelDetails
                                            const parcelData = {
                                              id: parcelId,
                                              properties: parcel.properties || parcel,
                                              address: address,
                                              lat: parcel.lat || parcel.properties?.LATITUDE ? parseFloat(parcel.lat || parcel.properties?.LATITUDE) : null,
                                              lng: parcel.lng || parcel.properties?.LONGITUDE ? parseFloat(parcel.lng || parcel.properties?.LONGITUDE) : null
                                            }
                                            onOpenParcelDetails(parcelData)
                                          }
                                        }}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium truncate">{address}</div>
                                          {parcel.skipTracedAt && (
                                            <div className="text-xs opacity-75">
                                              {new Date(parcel.skipTracedAt).toLocaleDateString()}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

