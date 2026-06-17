import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Phone, ListPlus, UserPlus, CloudRain, Camera, /* Telescope, */ CheckCircle2, Loader2 } from 'lucide-react'
import { PanelBackButton } from '../ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { DirectionsPicker } from '../DirectionsPicker'
import { cn } from '@/lib/utils'
import { useParcelDetailsData, CATEGORIES } from './useParcelDetailsData'
import { ContactSection } from './ContactSection'
import { ParcelDetailsActionTile } from './ParcelDetailsActionTile'
import { NotesSection } from './NotesSection'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contact', label: 'Contact' },
  { id: 'property', label: 'Property' },
  { id: 'valuation', label: 'Value' },
  { id: 'ownership', label: 'Owner' },
  { id: 'legal', label: 'Legal' },
]

/**
 * Option 3: Tabbed Card
 * Horizontal tabs to switch between focused views, no scroll needed per tab.
 */
const OUTSIDE_CLOSE_GRACE_MS = 500

export function ParcelDetailsV3({ isOpen, onClose, parcelData, onEmailClick, onPhoneClick, lists = [], enableAutoClose = true, onSkipTrace, onAddToList, onConvertToLead, onOpenPhotos, onHailData, /* onRoofInspector, */ isLead, popupData, suspendClose = false, obscuredByPanel = false }) {
  const data = useParcelDetailsData({ isOpen, parcelData, lists, enableAutoClose, onClose })
  const [activeTab, setActiveTab] = useState('overview')
  const openedAtRef = useRef(0)

  useEffect(() => {
    if (isOpen) openedAtRef.current = performance.now()
  }, [isOpen])

  const closeDetails = useCallback((reopenPopup = false) => {
    onClose?.({ reopenPopup })
  }, [onClose])

  const handleOutsideClose = useCallback((e) => {
    e.preventDefault()
    if (suspendClose || obscuredByPanel) return
    if (e.target?.closest?.('.hail-data-panel')) return
    // Ignore the click that opened this panel (Radix treats it as "outside").
    if (performance.now() - openedAtRef.current < OUTSIDE_CLOSE_GRACE_MS) return
    if (e.target?.closest?.('.parcel-popup-card')) return
    if (e.target?.closest?.('.list-panel:not(.parcel-details-panel)')) return
    closeDetails(false)
  }, [suspendClose, obscuredByPanel, closeDetails])

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
  pick('property', ['ACRES', 'ACREAGE', 'GIS_ACRES', 'LL_GIS_ACRES', 'CALC_AREA_SQM'])
  pick('property', ['ZONING', 'ZONING_CODE'])
  pick('property', ['USE_DESC', 'LOC_LAND_U', 'LAND_USE'])
  pick('location', ['SCHOOL_DISTRICT'])
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
        <div key={key} className="parcel-details-data-row flex justify-between py-2 gap-4 border-b border-white/5 last:border-0">
          <span className="parcel-details-data-label font-medium opacity-60 shrink-0">{label}</span>
          <span className="parcel-details-data-value text-right break-words">{value}</span>
        </div>
      ))}
    </div>
  )

  return (
    <Dialog open={isOpen} modal={false} onOpenChange={(open) => { if (!open && isOpen && !suspendClose && !obscuredByPanel) handleClose(false) }}>
      <DialogContent
        className={cn(
          'map-panel parcel-details-panel list-panel fullscreen-panel md:max-h-[80vh] p-0 gap-0',
          obscuredByPanel && 'invisible opacity-0 pointer-events-none',
        )}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop={obscuredByPanel}
        onPointerDownOutside={handleOutsideClose}
        onInteractOutside={handleOutsideClose}
      >
        <div ref={containerRef} className="contents">
          {/* Header: Address + Close */}
          <DialogHeader className="px-6 pt-5 pb-3 border-b-0 text-left" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
            <DialogDescription className="sr-only">Tabbed parcel details view</DialogDescription>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <PanelBackButton onClick={() => handleClose(true)} className="mt-1" />
              <div className="flex-1 min-w-0">
                <DialogTitle className="parcel-details-title text-3xl font-bold leading-tight">{address}</DialogTitle>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {ownerName && <span className="parcel-details-owner text-lg opacity-60">{ownerName}</span>}
                  {ownerOccupied && (
                    <span className={`parcel-details-badge inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ownerOccupied === 'Yes' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {ownerOccupied === 'Yes' ? 'Owner Occupied' : 'Absentee'}
                    </span>
                  )}
                  {quickStats.isQOZ && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-400"
                      title="Qualified Opportunity Zone — capital-gains tax incentive available to investors"
                    >
                      Opportunity Zone
                    </span>
                  )}
                </div>
                {quickStats.value && (
                  <p className="parcel-details-value text-lg font-semibold mt-1.5 leading-tight">{quickStats.value}</p>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Action Buttons */}
          <div className="parcel-details-actions parcel-details-actions-row px-6 pb-3 w-full">
            {onSkipTrace && (
              <ParcelDetailsActionTile
                label={
                  popupData?.isSkipTracing
                    ? 'Tracing…'
                    : popupData?.hasSkipTraced
                      ? 'Refresh'
                      : 'Contact'
                }
                variant="contact"
                active={!!popupData?.hasSkipTraced}
                disabled={popupData?.isSkipTracing}
                onClick={() => { if (!popupData?.isSkipTracing) onSkipTrace() }}
              >
                {popupData?.isSkipTracing
                  ? <Loader2 className="parcel-details-action-icon animate-spin" aria-hidden />
                  : popupData?.hasSkipTraced
                    ? <CheckCircle2 className="parcel-details-action-icon" aria-hidden />
                    : <Phone className="parcel-details-action-icon" aria-hidden />}
              </ParcelDetailsActionTile>
            )}
            <DirectionsPicker
              lat={normalized.lat}
              lng={normalized.lng}
              variant="parcel-tile"
              className="min-w-0"
            />
            {onAddToList && (
              <ParcelDetailsActionTile
                icon={ListPlus}
                label="Add to List"
                variant="list"
                onClick={() => onAddToList()}
              />
            )}
            {!isLead && onConvertToLead && (
              <ParcelDetailsActionTile
                icon={UserPlus}
                label="Add Lead"
                variant="lead"
                onClick={() => onConvertToLead()}
              />
            )}
            {onOpenPhotos && (
              <ParcelDetailsActionTile
                icon={Camera}
                label="Photos"
                variant="photos"
                onClick={(e) => { e.stopPropagation(); onOpenPhotos() }}
              />
            )}
            {onHailData && (
              <ParcelDetailsActionTile
                icon={CloudRain}
                label="Hail Data"
                variant="hail"
                onClick={(e) => { e.stopPropagation(); onHailData() }}
              />
            )}
            {/* roof inspector — restore onRoofInspector prop + Telescope import
            {onRoofInspector && (
              <ParcelDetailsActionTile icon={Telescope} label="Roof" variant="roof" onClick={() => onRoofInspector()} />
            )}
            */}
          </div>

          {/* Inline Notes */}
          <div className="px-6 pb-3 parcel-details-notes">
            {data.isEditingNote ? (
              <div className="space-y-2">
                <textarea
                  value={data.note}
                  onChange={(e) => data.setNote(e.target.value)}
                  placeholder="Add a note..."
                  className="parcel-details-note-input w-full min-h-[60px] p-2.5 rounded-lg resize-y bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={data.handleCancelNote} className="parcel-details-note-btn px-3 py-1 rounded-lg font-medium text-white/80 bg-white/10 border border-white/20 hover:bg-white/20 transition-colors">Cancel</button>
                  <button onClick={data.handleSaveNote} className="parcel-details-note-btn px-3 py-1 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors">Save</button>
                </div>
              </div>
            ) : data.note ? (
              <button onClick={() => data.setIsEditingNote(true)} className="parcel-details-note-display w-full text-left rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white/70 hover:bg-white/10 transition-colors whitespace-pre-wrap">
                {data.note}
              </button>
            ) : (
              <button onClick={() => data.setIsEditingNote(true)} className="parcel-details-note-empty w-full text-left rounded-lg border border-dashed border-white/15 px-3 py-2 text-white/30 hover:text-white/50 hover:border-white/25 transition-colors">
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
                  className={`parcel-details-tab px-3 py-2 font-medium whitespace-nowrap border-b-2 transition-colors ${
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
                      <div key={key} className="parcel-details-stat-card rounded-lg bg-white/5 px-3 py-2.5">
                        <div className="parcel-details-stat-label opacity-40 uppercase tracking-wide">{label}</div>
                        <div className="parcel-details-stat-value font-semibold mt-0.5">{value}</div>
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
                      <div className="parcel-details-section-title font-medium uppercase tracking-wide opacity-40 mb-2">{title}</div>
                      {renderDataRows(items)}
                    </div>
                  )
                })}
                {activeTab === 'property' && categorizedProps.other?.length > 0 && (
                  <div>
                    <div className="parcel-details-section-title font-medium uppercase tracking-wide opacity-40 mb-2">Other</div>
                    {renderDataRows(categorizedProps.other)}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contact' && (
              <ContactSection
                className="parcel-details-contact"
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
