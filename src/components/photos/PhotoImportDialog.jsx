import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Loader2,
  ImagePlus,
  Home,
  UserRound,
  MapPinOff,
  ChevronLeft,
  Camera,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { LeadPickerDialog } from './LeadPickerDialog'
import { AddressAutocompleteField } from '../AddressAutocompleteField'
import { showToast } from '../ui/toast'
import { cn } from '@/lib/utils'
import { usePhotoUpload } from '../../photos/PhotoUploadProvider'
import { readPhotosExifBatch } from '@/utils/exifMetadata'
import { TIME_WINDOW_PRESETS, MANUAL_TIME_WINDOW, isWithinTimeWindow } from '@/utils/photoTimeWindows'
import { resolveLeadParcelAtLocation } from '@/utils/resolveLeadParcel'
import {
  findLeadByParcelId,
  displayLeadName,
  formatLeadAddress,
  buildAutoLeadPayloadFromParcel,
  createLead,
} from '@/utils/leads'
import { resolveParcelId } from '@/utils/parcelPropertyMap'
import { reverseGeocodeCity } from '@/utils/reverseGeocode'
import { getTeamForMembership } from '@/utils/profile'
import { VISIBILITY } from '@/utils/access'

const STEP = {
  SELECT: 'select',
  PROCESSING: 'processing',
  REVIEW: 'review',
  IMPORTING: 'importing',
}

async function mapWithConcurrency(items, concurrency, worker) {
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index], index)
    }
  }
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: workerCount }, run))
}

function roundCoordKey(lat, lng) {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}`
}

/**
 * Bulk photo import: pick photos manually or by time window ("Today", "Last 30
 * days", …), then auto-attach each one to the right lead using its GPS EXIF —
 * creating a new lead per new property when needed.
 */
export function PhotoImportDialog({
  open,
  onClose,
  leads = [],
  getToken,
  currentUser,
  teams = [],
  teamMembership = null,
  onLeadsUpdated,
}) {
  const { enqueueCapture } = usePhotoUpload()
  const fileInputRef = useRef(null)

  const [step, setStep] = useState(STEP.SELECT)
  const [windowId, setWindowId] = useState('today')
  const [busyMessage, setBusyMessage] = useState('')
  const [skippedCount, setSkippedCount] = useState(0)
  const [groups, setGroups] = useState([])
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [assigningGroupKey, setAssigningGroupKey] = useState(null)

  useEffect(() => {
    if (open) return
    setStep(STEP.SELECT)
    setWindowId('today')
    setBusyMessage('')
    setSkippedCount(0)
    setGroups([])
    setImportProgress({ done: 0, total: 0 })
    setAssigningGroupKey(null)
  }, [open])

  const totalSelectedPhotos = useMemo(
    () => groups.reduce((sum, g) => (g.included && (g.kind !== 'unmatched' || g.assignedLead) ? sum + g.photos.length : sum), 0),
    [groups],
  )

  const processFiles = useCallback(async (files) => {
    setStep(STEP.PROCESSING)
    setBusyMessage(`Reading photo details… (0/${files.length})`)

    const exifResults = await readPhotosExifBatch(files, {
      concurrency: 4,
      onProgress: (done, total) => setBusyMessage(`Reading photo details… (${done}/${total})`),
    })

    const now = new Date()
    let skipped = 0
    const inWindow = []
    for (const r of exifResults) {
      if (windowId !== MANUAL_TIME_WINDOW && !isWithinTimeWindow(r.capturedAt, windowId, now)) {
        skipped += 1
        continue
      }
      inWindow.push(r)
    }

    const withGps = inWindow.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    const withoutGps = inWindow.filter((r) => !(Number.isFinite(r.lat) && Number.isFinite(r.lng)))

    const groupMap = new Map()
    const ensureGroup = (key, init) => {
      let g = groupMap.get(key)
      if (!g) {
        g = { key, photos: [], included: true, ...init }
        groupMap.set(key, g)
      }
      return g
    }

    if (withGps.length) {
      setBusyMessage(`Matching ${withGps.length} photo${withGps.length === 1 ? '' : 's'} to leads…`)
      await mapWithConcurrency(withGps, 3, async (r) => {
        const existingLead = findLeadByParcelId(leads, { lat: r.lat, lng: r.lng })
        if (existingLead) {
          const g = ensureGroup(`lead:${existingLead.id}`, {
            kind: 'existingLead',
            lead: existingLead,
            address: formatLeadAddress(existingLead) || displayLeadName(existingLead),
          })
          g.photos.push(r)
          return
        }

        let parcelData = null
        try {
          parcelData = await resolveLeadParcelAtLocation(r.lat, r.lng)
        } catch {
          parcelData = null
        }

        if (parcelData) {
          const pid = resolveParcelId(parcelData) || parcelData.id
          const key = pid ? `parcel:${pid}` : `coord:${roundCoordKey(r.lat, r.lng)}`
          const g = ensureGroup(key, {
            kind: 'newLead',
            parcelData,
            address: parcelData.address || '',
          })
          g.photos.push(r)
          return
        }

        const key = `coord:${roundCoordKey(r.lat, r.lng)}`
        const g = ensureGroup(key, {
          kind: 'newLead',
          parcelData: { id: null, properties: null, lat: r.lat, lng: r.lng, address: '' },
          address: '',
        })
        g.photos.push(r)
      })

      const needsLabel = [...groupMap.values()].filter((g) => g.kind === 'newLead' && !g.address)
      if (needsLabel.length) {
        setBusyMessage('Looking up addresses…')
        await mapWithConcurrency(needsLabel, 3, async (g) => {
          const first = g.photos[0]
          const city = await reverseGeocodeCity(first.lat, first.lng).catch(() => '')
          g.address = city ? `Near ${city}` : `Property at ${first.lat.toFixed(5)}, ${first.lng.toFixed(5)}`
          g.parcelData = { ...g.parcelData, address: g.address }
        })
      }
    }

    if (withoutGps.length) {
      groupMap.set('unmatched', {
        key: 'unmatched',
        kind: 'unmatched',
        photos: withoutGps,
        included: false,
        address: 'No location data',
        assignedLead: null,
      })
    }

    setSkippedCount(skipped)
    setGroups([...groupMap.values()])
    setStep(STEP.REVIEW)
  }, [leads, windowId])

  const handlePickFiles = () => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    void processFiles(files)
  }

  const toggleGroupIncluded = (key) => {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, included: !g.included } : g)))
  }

  const updateGroupAddress = (key, address) => {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, address } : g)))
  }

  const handleAssignLead = (lead) => {
    setGroups((prev) => prev.map((g) => (
      g.key === assigningGroupKey ? { ...g, assignedLead: lead, included: true } : g
    )))
    setAssigningGroupKey(null)
  }

  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  const handleImport = useCallback(async () => {
    const activeGroups = groups.filter((g) => g.included && (g.kind !== 'unmatched' || g.assignedLead))
    if (!activeGroups.length) {
      showToast('Nothing selected to import', 'info')
      return
    }

    setStep(STEP.IMPORTING)
    const totalPhotos = activeGroups.reduce((sum, g) => sum + g.photos.length, 0)
    let done = 0
    setImportProgress({ done: 0, total: totalPhotos })

    const activeTeam = getTeamForMembership(teams, teamMembership) || teams?.[0] || null
    const capturedByName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    const createdLeads = []
    let failCount = 0

    for (const group of activeGroups) {
      let lead = group.lead || group.assignedLead || null
      let existingPhotosForLimit = lead?.photos || []

      if (!lead) {
        try {
          const payloadParcel = { ...group.parcelData, address: group.address || group.parcelData?.address }
          const payload = buildAutoLeadPayloadFromParcel(payloadParcel)
          lead = await createLead(getToken, {
            ...payload,
            visibility: VISIBILITY.PRIVATE,
            sharedMemberUids: [],
            teamId: activeTeam?.id || null,
            teamShares: [],
          })
          createdLeads.push(lead)
          existingPhotosForLimit = []
        } catch {
          failCount += group.photos.length
          done += group.photos.length
          setImportProgress({ done, total: totalPhotos })
          showToast(`Could not create a lead for ${group.address || 'a property'}`, 'error')
          continue
        }
      }

      const entityRef = { entityType: 'lead', leadId: lead.id, entityId: lead.id }
      const parcelId = group.parcelData
        ? (resolveParcelId(group.parcelData) || group.parcelData.id || null)
        : (lead.parcelId || null)

      for (const photo of group.photos) {
        try {
          await enqueueCapture(photo.file, entityRef, {
            capturedByUid: currentUser?.uid ?? null,
            capturedByName,
            lat: photo.lat ?? lead.lat ?? null,
            lng: photo.lng ?? lead.lng ?? null,
            addressLabel: group.address || formatLeadAddress(lead) || lead.address || '',
            parcelId,
            capturedAt: photo.capturedAt ? photo.capturedAt.toISOString() : undefined,
          }, existingPhotosForLimit)
        } catch {
          failCount += 1
        }
        done += 1
        setImportProgress({ done, total: totalPhotos })
      }
    }

    if (createdLeads.length) onLeadsUpdated?.(createdLeads)

    const importedCount = totalPhotos - failCount
    if (importedCount > 0) {
      showToast(`${importedCount} photo${importedCount === 1 ? '' : 's'} uploading in the background`, 'success')
    }
    if (failCount > 0) {
      showToast(`${failCount} photo${failCount === 1 ? '' : 's'} could not be queued`, 'error')
    }

    handleClose()
  }, [groups, teams, teamMembership, currentUser, getToken, enqueueCapture, onLeadsUpdated, handleClose])

  const assigningGroup = groups.find((g) => g.key === assigningGroupKey) || null

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && step !== STEP.IMPORTING && handleClose()}>
        <DialogContent
          className="map-panel share-list-dialog photo-import-dialog w-[min(94vw,28rem)] max-w-lg max-h-[min(88vh,720px)] rounded-xl p-0 gap-0 overflow-hidden flex flex-col"
          showCloseButton={step !== STEP.IMPORTING}
          focusOverlay
          topLayer
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />

          <div className="share-dialog-inner flex flex-col min-h-0 flex-1">
            <DialogHeader className="share-dialog-header shrink-0 relative">
              <DialogTitle className="share-dialog-title flex items-center gap-2">
                <ImagePlus className="h-4 w-4" />
                Import Photos
              </DialogTitle>
              <DialogDescription className="sr-only">
                Import photos from your device and auto-attach them to leads using location data
              </DialogDescription>
            </DialogHeader>

            <div className="share-dialog-body flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-4 px-5 py-4">
              {step === STEP.SELECT && (
                <div className="space-y-4">
                  <p className="text-xs opacity-60 leading-snug">
                    Pick a time window or select photos manually — we'll use each photo's location
                    to find (or create) the matching lead.
                  </p>
                  <div>
                    <label className="text-xs opacity-60 mb-1.5 block">Time window</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TIME_WINDOW_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setWindowId(preset.id)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs border transition-colors',
                            windowId === preset.id
                              ? 'bg-white/90 text-gray-900 border-white/90'
                              : 'bg-white/5 border-white/15 hover:bg-white/10',
                          )}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setWindowId(MANUAL_TIME_WINDOW)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs border transition-colors',
                          windowId === MANUAL_TIME_WINDOW
                            ? 'bg-white/90 text-gray-900 border-white/90'
                            : 'bg-white/5 border-white/15 hover:bg-white/10',
                        )}
                      >
                        No filter (manual)
                      </button>
                    </div>
                    <p className="text-[11px] opacity-50 mt-1.5">
                      {windowId === MANUAL_TIME_WINDOW
                        ? 'Every photo you select will be imported.'
                        : 'Photos outside the selected window will be skipped automatically.'}
                    </p>
                  </div>
                  <Button type="button" className="w-full min-h-[44px]" onClick={handlePickFiles}>
                    <Camera className="h-4 w-4 mr-2" />
                    Choose Photos
                  </Button>
                </div>
              )}

              {step === STEP.PROCESSING && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <Loader2 className="h-7 w-7 animate-spin opacity-70" />
                  <p className="text-sm opacity-70">{busyMessage}</p>
                </div>
              )}

              {step === STEP.REVIEW && (
                <div className="space-y-3">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs opacity-60 hover:opacity-90"
                    onClick={() => setStep(STEP.SELECT)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>

                  {skippedCount > 0 && (
                    <p className="text-[11px] opacity-50">
                      Skipped {skippedCount} photo{skippedCount === 1 ? '' : 's'} outside the selected window.
                    </p>
                  )}

                  {groups.length === 0 && (
                    <p className="text-sm opacity-60 py-6 text-center">No photos matched — try a different time window.</p>
                  )}

                  {groups.map((group) => (
                    <div key={group.key} className="rounded-lg border border-white/15 bg-white/[0.04] p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0 opacity-70">
                          {group.kind === 'existingLead' && <UserRound className="h-4 w-4" />}
                          {group.kind === 'newLead' && <Home className="h-4 w-4" />}
                          {group.kind === 'unmatched' && <MapPinOff className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {group.kind === 'existingLead' && (
                            <>
                              <p className="text-sm font-medium truncate">{displayLeadName(group.lead)}</p>
                              <p className="text-xs opacity-60 truncate">{group.address}</p>
                            </>
                          )}
                          {group.kind === 'newLead' && (
                            <>
                              <p className="text-xs uppercase tracking-wide opacity-50 mb-1">New lead</p>
                              <AddressAutocompleteField
                                value={group.address}
                                onChange={(v) => updateGroupAddress(group.key, v)}
                                onSelectResult={({ address }) => updateGroupAddress(group.key, address)}
                                placeholder="Property address"
                              />
                            </>
                          )}
                          {group.kind === 'unmatched' && (
                            <>
                              <p className="text-sm font-medium">No location data</p>
                              <p className="text-xs opacity-60">
                                {group.assignedLead
                                  ? `Assign to ${displayLeadName(group.assignedLead)}`
                                  : "These photos don't have GPS info — assign them to a lead or skip."}
                              </p>
                            </>
                          )}
                        </div>
                        <label className="flex items-center gap-1.5 shrink-0 text-xs opacity-70 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!group.included}
                            disabled={group.kind === 'unmatched' && !group.assignedLead}
                            onChange={() => toggleGroupIncluded(group.key)}
                            className="h-3.5 w-3.5"
                          />
                          {group.photos.length}
                        </label>
                      </div>
                      {group.kind === 'unmatched' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setAssigningGroupKey(group.key)}
                        >
                          {group.assignedLead ? 'Change lead' : 'Assign to a lead'}
                        </Button>
                      )}
                    </div>
                  ))}

                  {groups.length > 0 && (
                    <Button
                      type="button"
                      className="w-full min-h-[44px]"
                      onClick={handleImport}
                      disabled={totalSelectedPhotos === 0}
                    >
                      Import {totalSelectedPhotos} photo{totalSelectedPhotos === 1 ? '' : 's'}
                    </Button>
                  )}
                </div>
              )}

              {step === STEP.IMPORTING && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <Loader2 className="h-7 w-7 animate-spin opacity-70" />
                  <p className="text-sm opacity-70">
                    Uploading {importProgress.done} of {importProgress.total}…
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LeadPickerDialog
        open={!!assigningGroup}
        onClose={() => setAssigningGroupKey(null)}
        leads={leads}
        onSelectLead={handleAssignLead}
        title="Assign photos to a lead"
        nestedOverlay
      />
    </>
  )
}
