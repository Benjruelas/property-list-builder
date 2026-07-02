import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, MapPin, Camera, ChevronLeft, TriangleAlert, UserRound, Home } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { AddressAutocompleteField } from '../AddressAutocompleteField'
import { getCurrentPositionWithFallback } from '@/utils/geolocation'
import { resolveLeadParcelAtLocation } from '@/utils/resolveLeadParcel'
import { findLeadByParcelId, displayLeadName, formatLeadAddress } from '@/utils/leads'
import { geocodeAddressForLead } from '@/utils/geocodeAddress'
import { reverseGeocodeCity } from '@/utils/reverseGeocode'
import { showToast } from '../ui/toast'

const STEP = {
  LOCATING: 'locating',
  CONFIRM: 'confirm',
  NO_PARCEL: 'no-parcel',
  MANUAL: 'manual',
}

/**
 * Quick Photo Mode: geolocate the user, resolve the parcel/lead at that point,
 * let them confirm (or type the real address), then hand the result back so
 * the caller can open PhotoCaptureModal straight into the camera.
 */
export function QuickPhotoModeDialog({ open, onClose, leads = [], onConfirm }) {
  const [step, setStep] = useState(STEP.LOCATING)
  const [statusMessage, setStatusMessage] = useState('Finding your location…')
  const [errorMessage, setErrorMessage] = useState('')
  const [candidate, setCandidate] = useState(null)
  const [manualAddress, setManualAddress] = useState('')
  const [manualBusy, setManualBusy] = useState(false)
  const [forceNewLead, setForceNewLead] = useState(false)
  const requestIdRef = useRef(0)

  const resolveAt = useCallback(async (lat, lng, { ignoreExistingLeads = false } = {}) => {
    const requestId = ++requestIdRef.current
    setStep(STEP.LOCATING)
    setStatusMessage('Looking up this property…')
    setErrorMessage('')
    const leadLookupOptions = { matchCoords: false }
    try {
      const parcelData = await resolveLeadParcelAtLocation(lat, lng)
      if (requestId !== requestIdRef.current) return
      if (parcelData) {
        const existingLead = ignoreExistingLeads
          ? null
          : findLeadByParcelId(leads, parcelData, leadLookupOptions)
        setCandidate({ parcelData, lead: existingLead || null, lat, lng })
        setStep(STEP.CONFIRM)
        return
      }
      const existingLead = ignoreExistingLeads
        ? null
        : findLeadByParcelId(leads, { lat, lng }, leadLookupOptions)
      if (existingLead) {
        setCandidate({ parcelData: null, lead: existingLead, lat, lng })
        setStep(STEP.CONFIRM)
        return
      }
      const cityLabel = await reverseGeocodeCity(lat, lng).catch(() => '')
      setCandidate({ parcelData: null, lead: null, lat, lng, cityLabel })
      setStep(STEP.NO_PARCEL)
    } catch {
      if (requestId !== requestIdRef.current) return
      setErrorMessage('Could not look up this location — try entering the address instead')
      setStep(STEP.MANUAL)
    }
  }, [leads])

  const locate = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setStep(STEP.LOCATING)
    setStatusMessage('Finding your location…')
    setErrorMessage('')
    try {
      const pos = await getCurrentPositionWithFallback()
      if (requestId !== requestIdRef.current) return
      await resolveAt(pos.coords.latitude, pos.coords.longitude)
    } catch {
      if (requestId !== requestIdRef.current) return
      setErrorMessage('Could not get your location — enter the address instead')
      setStep(STEP.MANUAL)
    }
  }, [resolveAt])

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1
      setStep(STEP.LOCATING)
      setStatusMessage('Finding your location…')
      setErrorMessage('')
      setCandidate(null)
      setManualAddress('')
      setManualBusy(false)
      setForceNewLead(false)
      return
    }
    void locate()
    // Only re-run when the dialog opens, not on every `locate` identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleManualSelect = useCallback(({ address, latParsed, lngParsed }) => {
    setManualAddress(address || '')
    if (Number.isFinite(latParsed) && Number.isFinite(lngParsed)) {
      void resolveAt(latParsed, lngParsed, { ignoreExistingLeads: true })
    }
  }, [resolveAt])

  const handleManualSubmit = useCallback(async () => {
    const trimmed = manualAddress.trim()
    if (!trimmed) return
    setManualBusy(true)
    try {
      const geo = await geocodeAddressForLead(trimmed)
      if (!geo) {
        showToast('Could not find that address', 'error')
        return
      }
      await resolveAt(geo.lat, geo.lng, { ignoreExistingLeads: true })
    } finally {
      setManualBusy(false)
    }
  }, [manualAddress, resolveAt])

  const handleConfirm = () => {
    if (!candidate) return
    if (candidate.lead && !forceNewLead) {
      onConfirm?.({ lead: candidate.lead })
      return
    }
    if (candidate.parcelData) {
      onConfirm?.({ parcelData: candidate.parcelData, forceNewLead: true })
      return
    }
    const fallbackAddress =
      manualAddress.trim() ||
      candidate.cityLabel ||
      `Current location (${candidate.lat.toFixed(5)}, ${candidate.lng.toFixed(5)})`
    onConfirm?.({
      parcelData: {
        id: null,
        properties: null,
        lat: candidate.lat,
        lng: candidate.lng,
        address: fallbackAddress,
      },
      forceNewLead: true,
    })
  }

  const openManualStep = () => {
    setForceNewLead(true)
    setStep(STEP.MANUAL)
  }

  const ownerName = candidate?.parcelData?.properties?.OWNER_NAME || ''

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className="map-panel share-list-dialog quick-photo-mode-dialog w-[min(92vw,24rem)] max-w-md rounded-xl p-0 gap-0 overflow-hidden flex flex-col"
        showCloseButton
        focusOverlay
        topLayer
      >
        <div className="share-dialog-inner flex flex-col min-h-0">
          <DialogHeader className="share-dialog-header shrink-0 relative">
            <DialogTitle className="share-dialog-title flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Photo Mode
            </DialogTitle>
            <DialogDescription className="sr-only">
              Find the property at your location and start taking photos
            </DialogDescription>
          </DialogHeader>

          <div className="share-dialog-body space-y-4 px-5 py-4">
            {step === STEP.LOCATING && (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <Loader2 className="h-7 w-7 animate-spin opacity-70" />
                <p className="text-sm opacity-70">{statusMessage}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => onClose?.()}>
                  Cancel
                </Button>
              </div>
            )}

            {step === STEP.CONFIRM && candidate && (
              <div className="space-y-4">
                <div className="rounded-lg border border-white/15 bg-white/[0.04] p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-60">
                    {candidate.lead ? <UserRound className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
                    {candidate.lead ? 'Existing lead nearby' : 'Property at your location'}
                  </div>
                  <p className="text-sm font-medium leading-snug">
                    {candidate.lead ? displayLeadName(candidate.lead) : (candidate.parcelData?.address || 'This property')}
                  </p>
                  <p className="text-xs opacity-60 leading-snug">
                    {candidate.lead ? (formatLeadAddress(candidate.lead) || '') : (ownerName ? `Owner: ${ownerName}` : '')}
                  </p>
                </div>
                <Button type="button" className="w-full min-h-[44px]" onClick={handleConfirm}>
                  <Camera className="h-4 w-4 mr-2" />
                  {candidate.lead ? 'Use this lead & start camera' : 'Start taking photos'}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs opacity-60 hover:opacity-90 underline underline-offset-2"
                  onClick={openManualStep}
                >
                  Not the right address?
                </button>
              </div>
            )}

            {step === STEP.NO_PARCEL && candidate && (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-200/80">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    No property record found
                  </div>
                  <p className="text-xs opacity-70 leading-snug">
                    {candidate.cityLabel
                      ? `We couldn't match a parcel near ${candidate.cityLabel}. You can still start a lead here.`
                      : "We couldn't match a parcel at your location. You can still start a lead here."}
                  </p>
                </div>
                <Button type="button" className="w-full min-h-[44px]" onClick={handleConfirm}>
                  <Camera className="h-4 w-4 mr-2" />
                  Continue anyway
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs opacity-60 hover:opacity-90 underline underline-offset-2"
                  onClick={openManualStep}
                >
                  Enter the address instead
                </button>
              </div>
            )}

            {step === STEP.MANUAL && (
              <div className="space-y-3">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs opacity-60 hover:opacity-90"
                  onClick={() => {
                    setForceNewLead(false)
                    void locate()
                  }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Try my location again
                </button>
                {errorMessage && (
                  <p className="text-xs text-amber-300/90 flex items-center gap-1.5">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    {errorMessage}
                  </p>
                )}
                <div>
                  <label className="text-xs opacity-60 mb-1 block">Property address</label>
                  <AddressAutocompleteField
                    value={manualAddress}
                    onChange={setManualAddress}
                    onSelectResult={handleManualSelect}
                    placeholder="Start typing an address…"
                  />
                </div>
                <Button
                  type="button"
                  className="w-full min-h-[44px]"
                  onClick={handleManualSubmit}
                  disabled={!manualAddress.trim() || manualBusy}
                >
                  {manualBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                  Use this address
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
