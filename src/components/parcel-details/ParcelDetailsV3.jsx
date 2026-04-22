import { useState } from 'react'
import { X, Phone, ListPlus, UserPlus, CloudRain, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { DirectionsPicker } from '../DirectionsPicker'
import { useParcelDetailsData, CATEGORIES } from './useParcelDetailsData'
import { ContactSection } from './ContactSection'
import { NotesSection } from './NotesSection'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'property', label: 'Property' },
  { id: 'valuation', label: 'Value' },
  { id: 'ownership', label: 'Owner' },
  { id: 'legal', label: 'Legal' },
  { id: 'contact', label: 'Contact' },
]

/**
 * Option 3: Tabbed Card
 * Horizontal tabs to switch between focused views, no scroll needed per tab.
 */
export function ParcelDetailsV3({ isOpen, onClose, parcelData, onEmailClick, onPhoneClick, lists = [], enableAutoClose = true, onSkipTrace, onAddToList, onConvertToLead, onHailData, isLead, popupData }) {
  const data = useParcelDetailsData({ isOpen, parcelData, lists, enableAutoClose, onClose })
  const [activeTab, setActiveTab] = useState('overview')

  if (!data) return null
  const { normalized, address, ownerName, ownerOccupied, quickStats, categorizedProps, handleClose, containerRef, scrollContainerRef } = data

  const overviewItems = []
  const pick = (cat, keys) => {
    for (const k of keys) {
      const found = categorizedProps[cat]?.find(i => i.key === k)
      if (found) { overviewItems.push(found); return }
    }
  }
  pick('valuation', ['MKT_VAL', 'TOTAL_VALUE', 'ASSESSED_VALUE'])
  pick('property', ['SQFT', 'SQ_FT', 'BLDG_SQFT'])
  pick('property', ['YEAR_BUILT', 'YEARBLT'])
  pick('property', ['BEDROOMS', 'BEDROOM', 'BEDS'])
  pick('property', ['BATHROOMS', 'BATHROOM', 'BATHS'])
  pick('property', ['ACRES', 'ACREAGE', 'GIS_ACRES', 'CALC_AREA_SQM'])
  pick('property', ['ZONING', 'ZONING_CODE'])
  pick('property', ['USE_DESC', 'LOC_LAND_U', 'LAND_USE'])
  const allOwnership = [...(categorizedProps.ownership || [])]
  const allIdentification = [...(categorizedProps.identification || [])]

  const tabCategoryMap = {
    property: ['property'],
    valuation: ['valuation'],
    ownership: ['ownership', 'mailing', 'identification'],
    legal: ['legal', 'location'],
  }

  const renderDataRows = (items) => (
    <div className="space-y-0">
      {items.map(({ key, label, value }) => (
        <div key={key} className="flex justify-between py-2 gap-4 text-sm border-b border-white/5 last:border-0">
          <span className="font-medium opacity-60 shrink-0">{label}</span>
          <span className="text-right break-words">{value}</span>
        </div>
      ))}
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(false) }}>
      <DialogContent className="map-panel parcel-details-panel list-panel fullscreen-panel max-w-2xl max-h-[80vh] p-0 gap-0" showCloseButton={false} hideOverlay onInteractOutside={(e) => { e.preventDefault(); handleClose(false) }}>
        <div ref={containerRef} className="contents">
          {/* Header: Address + Close */}
          <DialogHeader className="px-6 pt-5 pb-3 border-b-0 text-left" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
            <DialogDescription className="sr-only">Tabbed parcel details view</DialogDescription>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-3xl font-bold leading-tight">{address}</DialogTitle>
                <div className="flex items-center gap-2 mt-1.5">
                  {ownerName && <span className="text-lg opacity-60">{ownerName}</span>}
                  {ownerOccupied && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ownerOccupied === 'Yes' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {ownerOccupied === 'Yes' ? 'Owner Occupied' : 'Absentee'}
                    </span>
                  )}
                  {quickStats.value && <span className="text-sm font-semibold ml-auto">{quickStats.value}</span>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleClose(true)} className="parcel-details-close-btn shrink-0 mt-1"><X className="h-4 w-4" /></Button>
            </div>
          </DialogHeader>

          {/* Action Buttons */}
          <div className="px-6 pb-3 flex items-center gap-2">
            {onSkipTrace && (
              <button
                onClick={() => { if (!popupData?.isSkipTracing) onSkipTrace() }}
                disabled={popupData?.isSkipTracing}
                className={`p-3.5 rounded-xl text-white transition-colors ${
                  popupData?.isSkipTracing
                    ? 'bg-amber-600/30 text-amber-300 cursor-wait'
                    : popupData?.hasSkipTraced
                      ? 'bg-green-600/40 hover:bg-green-600/60 text-green-200'
                      : 'bg-green-600/80 hover:bg-green-600'
                }`}
                title={
                  popupData?.isSkipTracing
                    ? 'Skip Tracing...'
                    : popupData?.hasSkipTraced
                      ? 'Refresh Contact Info'
                      : 'Get Contact Info'
                }
              >
                {popupData?.isSkipTracing
                  ? <Loader2 size={22} className="animate-spin" />
                  : popupData?.hasSkipTraced
                    ? <CheckCircle2 size={22} />
                    : <Phone size={22} />}
              </button>
            )}
            <DirectionsPicker lat={normalized.lat} lng={normalized.lng} iconSize={22} className="p-3.5 rounded-xl" />
            {onAddToList && <button onClick={() => onAddToList()} className="p-3.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white transition-colors" title="Add to List"><ListPlus size={22} /></button>}
            {!isLead && onConvertToLead && <button onClick={() => onConvertToLead()} className="p-3.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white transition-colors" title="Convert to Lead"><UserPlus size={22} /></button>}
            {onHailData && <button onClick={() => onHailData()} className="p-3.5 rounded-xl bg-orange-600/80 hover:bg-orange-600 text-white transition-colors" title="Hail Data"><CloudRain size={22} /></button>}
          </div>

          {/* Inline Notes */}
          <div className="px-6 pb-3">
            {data.isEditingNote ? (
              <div className="space-y-2">
                <textarea
                  value={data.note}
                  onChange={(e) => data.setNote(e.target.value)}
                  placeholder="Add a note..."
                  className="w-full min-h-[60px] p-2.5 rounded-lg text-sm resize-y bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={data.handleCancelNote} className="px-3 py-1 rounded-lg text-xs font-medium text-white/80 bg-white/10 border border-white/20 hover:bg-white/20 transition-colors">Cancel</button>
                  <button onClick={data.handleSaveNote} className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors">Save</button>
                </div>
              </div>
            ) : data.note ? (
              <button onClick={() => data.setIsEditingNote(true)} className="w-full text-left rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors whitespace-pre-wrap">
                {data.note}
              </button>
            ) : (
              <button onClick={() => data.setIsEditingNote(true)} className="w-full text-left rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/30 hover:text-white/50 hover:border-white/25 transition-colors">
                + Add a note...
              </button>
            )}
          </div>

          {/* Tab Bar */}
          <div className="px-6 border-b border-white/15">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-400 text-blue-400'
                      : 'border-transparent opacity-50 hover:opacity-80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div ref={scrollContainerRef} className="parcel-details-scroll px-6 py-4 overflow-y-auto flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {overviewItems.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {overviewItems.map(({ key, label, value }) => (
                      <div key={key} className="rounded-lg bg-white/5 px-3 py-2.5">
                        <div className="text-[11px] opacity-40 uppercase tracking-wide">{label}</div>
                        <div className="text-sm font-semibold mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {allIdentification.length > 0 && renderDataRows(allIdentification)}
                {(categorizedProps.address || []).length > 0 && renderDataRows(categorizedProps.address)}
              </div>
            )}

            {tabCategoryMap[activeTab] && (
              <div className="space-y-5">
                {tabCategoryMap[activeTab].map(catKey => {
                  const items = categorizedProps[catKey]
                  if (!items?.length) return null
                  const title = catKey === 'other' ? 'Other' : CATEGORIES[catKey]?.title || catKey
                  return (
                    <div key={catKey}>
                      <div className="text-xs font-medium uppercase tracking-wide opacity-40 mb-2">{title}</div>
                      {renderDataRows(items)}
                    </div>
                  )
                })}
                {activeTab === 'property' && categorizedProps.other?.length > 0 && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide opacity-40 mb-2">Other</div>
                    {renderDataRows(categorizedProps.other)}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contact' && (
              <ContactSection
                data={data}
                onPhoneClick={onPhoneClick}
                onEmailClick={onEmailClick}
                onSkipTrace={onSkipTrace}
                isSkipTracing={!!popupData?.isSkipTracing}
                hasSkipTraced={!!popupData?.hasSkipTraced}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
