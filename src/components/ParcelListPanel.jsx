import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, ChevronRight, ChevronDown, Trash2, Download } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { ListParcelExpanded } from '@/components/parcel-list-expanded/ListParcelExpanded'

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
  onExportList,
  skipTracingInProgress = new Set(),
  /** Matches map parcel outlines — expanded row border + expanded gradients */
  parcelBoundaryColor = '#2563eb',
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
      <DialogContent className="map-panel list-panel parcel-list-panel fullscreen-panel max-w-2xl max-h-[80vh] p-0" showCloseButton={false} hideOverlay>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20 text-left" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="map-panel-header-toolbar gap-3">
            <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={onBack || onClose}
                title="Back to lists"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogTitle className="min-w-0 flex-1 truncate text-xl font-semibold">
                {listName || 'Parcels'}
              </DialogTitle>
            </div>
            <div className="map-panel-header-actions gap-1">
              {onExportList && parcels.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-600 hover:text-blue-700"
                  onClick={() => onExportList(selectedListId)}
                  title="Export list as CSV and email to you"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <DialogDescription className="sr-only">
            List of parcels in {listName || 'this list'}. Click on a parcel to view details.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
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
                      "map-panel-list-item rounded-xl transition-all overflow-hidden border border-white/10",
                      isExpanded ? "border-solid bg-white/[0.06]" : "hover:bg-white/[0.08]"
                    )}
                    style={isExpanded ? {
                      borderColor: parcelBoundaryColor,
                      boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                    } : undefined}
                  >
                    <div 
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.04]"
                      onClick={() => toggleParcel(parcelId)}
                    >
                      <span className="font-semibold text-sm text-white/90 flex-1 truncate">
                        {address}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-white/45 ml-2 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-white/45 ml-2 flex-shrink-0" />
                      )}
                    </div>
                    
                    {isExpanded && (
                      <ListParcelExpanded
                        boundaryColor={parcelBoundaryColor}
                        parcel={parcel}
                        parcelId={parcelId}
                        selectedListId={selectedListId}
                        address={address}
                        props={props}
                        onRemoveParcel={onRemoveParcel}
                        handleRemoveParcel={handleRemoveParcel}
                        onOpenParcelDetails={onOpenParcelDetails}
                        onPhoneClick={onPhoneClick}
                        onSkipTraceParcel={onSkipTraceParcel}
                        onConvertToLead={onConvertToLead}
                        isParcelALeadProp={isParcelALeadProp}
                        skipTracingInProgress={skipTracingInProgress}
                        handleCenterParcel={handleCenterParcel}
                        setRefreshTrigger={setRefreshTrigger}
                      />
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

