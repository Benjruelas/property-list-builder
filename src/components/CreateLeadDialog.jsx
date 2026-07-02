import { useState, useEffect, useCallback } from 'react'
import { Loader2, UserPlus, X } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { AddressAutocompleteField } from './AddressAutocompleteField'
import { ResourceSharePicker } from './ResourceSharePicker'
import { VISIBILITY, normalizeResourceVisibility, resolveResourceAccess, canChangeVisibility } from '@/utils/access'
import { createLead, updateLead } from '@/utils/leads'
import { mergeLeadFormWithParcel, ensureLeadParcelLink } from '@/utils/resolveLeadParcel'
import { getTeamForMembership } from '@/utils/profile'
import { showToast } from './ui/toast'
import { LeadContactFieldList } from './leads/LeadContactFieldList'
import {
  contactDetailsFromForm,
  phoneDetailsForLeadForm,
  emailDetailsForLeadForm,
  CONTACT_SOURCE_USER,
} from '@/utils/leadContact'

const emptyContactEntry = { value: '', source: CONTACT_SOURCE_USER, callerId: '', primary: false }

const emptyForm = {
  firstName: '',
  lastName: '',
  address: '',
  phoneDetails: [emptyContactEntry],
  emailDetails: [emptyContactEntry],
  notes: '',
  parcelId: null,
  lat: null,
  lng: null,
  properties: null,
}

function normalizeLeadForm(data = {}) {
  return {
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    address: data.address ?? '',
    phoneDetails: phoneDetailsForLeadForm(data),
    emailDetails: emailDetailsForLeadForm(data),
    notes: data.notes ?? '',
    parcelId: data.parcelId ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    properties: data.properties ?? null,
  }
}

export function CreateLeadDialog({
  open,
  onOpenChange,
  prefill = null,
  editLead = null,
  getToken,
  onResolveParcel,
  onCreated,
  onUpdated,
  existingLeads = [],
  teams = [],
  teamMembership = null,
  currentUser = null,
  nestedOverlay = false,
  topLayer = false,
  confirmLayer = false,
}) {
  const activeTeam = getTeamForMembership(teams, teamMembership) || teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true
  const canEditSharing = !isEdit || canChangeVisibility(resolveResourceAccess(
    editLead,
    currentUser,
    activeTeam,
    teams,
  ))
  const [form, setForm] = useState(emptyForm)
  const [shareState, setShareState] = useState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
  const [saving, setSaving] = useState(false)
  const [resolvingParcel, setResolvingParcel] = useState(false)
  const isEdit = !!editLead?.id
  const fromParcel = Boolean(prefill?.parcelId) && !isEdit

  useEffect(() => {
    if (!open) {
      setForm(emptyForm)
      return
    }
    if (editLead) {
      setForm(normalizeLeadForm(editLead))
      const norm = normalizeResourceVisibility(editLead)
      setShareState({
        visibility: norm.visibility || VISIBILITY.PRIVATE,
        sharedMemberUids: norm.sharedMemberUids || [],
      })
    } else if (prefill) {
      setForm(normalizeLeadForm({ ...emptyForm, ...prefill }))
      setShareState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
    } else {
      setForm(emptyForm)
      setShareState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
    }
  }, [open, prefill, editLead, teams])

  const setField = (key, val) => {
    setForm((f) => {
      const next = { ...f, [key]: val }
      if (key !== 'parcelId' && key !== 'lat' && key !== 'lng' && key !== 'properties') {
        next[key] = val ?? ''
      }
      return next
    })
  }

  const resolveParcelAt = useCallback(async (lat, lng) => {
    if (!onResolveParcel || lat == null || lng == null) return null
    setResolvingParcel(true)
    try {
      const parcel = await onResolveParcel(lat, lng)
      if (parcel?.id || parcel?.parcelId) {
        setForm((f) => mergeLeadFormWithParcel(f, parcel))
      }
      return parcel
    } finally {
      setResolvingParcel(false)
    }
  }, [onResolveParcel])

  const handleAddressSelect = useCallback(async ({ address, latParsed, lngParsed }) => {
    setField('address', address ?? '')
    if (latParsed != null && lngParsed != null) {
      setForm((f) => ({ ...f, lat: latParsed, lng: lngParsed }))
      await resolveParcelAt(latParsed, lngParsed)
    }
  }, [resolveParcelAt])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const firstName = (form.firstName ?? '').trim()
    const lastName = (form.lastName ?? '').trim()
    const address = (form.address ?? '').trim()
    if (!firstName && !lastName) {
      showToast('Enter a first or last name', 'error')
      return
    }
    setSaving(true)
    try {
      const linked = await ensureLeadParcelLink(
        { ...form, firstName, lastName, address },
        onResolveParcel
      )
      if (!linked.parcelId && linked.lat != null && linked.lng != null) {
        showToast('Could not link to a county parcel — lead saved with map coordinates only', 'warning')
      }
      const payload = {
        firstName,
        lastName,
        address: linked.address || address,
        ...contactDetailsFromForm(form),
        notes: (form.notes ?? '').trim(),
        parcelId: linked.parcelId,
        lat: linked.lat,
        lng: linked.lng,
        properties: linked.properties,
        visibility: shareState.visibility,
        sharedMemberUids: shareState.sharedMemberUids,
        teamId: activeTeam?.id || null,
        teamShares: shareState.visibility === VISIBILITY.TEAM && activeTeam ? [activeTeam.id] : [],
      }
      if (linked.parcelId && existingLeads.some((l) => l.parcelId === linked.parcelId && l.id !== editLead?.id)) {
        showToast('A lead already exists for this parcel', 'warning')
        return
      }
      if (isEdit) {
        const lead = await updateLead(getToken, editLead.id, payload)
        showToast('Lead updated', 'success')
        onUpdated?.(lead)
      } else {
        const lead = await createLead(getToken, payload)
        showToast('Lead created', 'success')
        onCreated?.(lead)
      }
      onOpenChange(false)
    } catch (err) {
      showToast(err.message || 'Could not save lead', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} modal={false} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel list-panel create-lead-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
        confirmLayer={confirmLayer}
      >
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b border-white/20 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <PanelHeader
            onBack={() => onOpenChange(false)}
            title={isEdit ? 'Edit Lead' : 'Create Lead'}
            icon={UserPlus}
          />
          <DialogDescription className="sr-only">
            {isEdit ? 'Update lead contact and property details' : 'Add a new lead with property and contact info'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="create-lead-form flex flex-col flex-1 min-h-0">
          <div className="create-lead-form-body scrollbar-hide px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs opacity-60 mb-1 block">First Name</label>
              <input
                type="text"
                value={form.firstName ?? ''}
                onChange={(e) => setField('firstName', e.target.value)}
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="text-xs opacity-60 mb-1 block">Last Name</label>
              <input
                type="text"
                value={form.lastName ?? ''}
                onChange={(e) => setField('lastName', e.target.value)}
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div>
            <label className="text-xs opacity-60 mb-1 block">Property Address</label>
            <AddressAutocompleteField
              value={form.address ?? ''}
              onChange={(v) => {
                setForm((f) => ({
                  ...f,
                  address: v ?? '',
                  parcelId: null,
                  lat: null,
                  lng: null,
                  properties: null,
                }))
              }}
              onSelectResult={handleAddressSelect}
            />
            {resolvingParcel && (
              <p className="text-[11px] opacity-50 mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Linking parcel…
              </p>
            )}
            {form.parcelId && !resolvingParcel && (
              <p className="text-[11px] text-emerald-400/80 mt-1">Linked to parcel on map</p>
            )}
          </div>

          <LeadContactFieldList
            kind="phone"
            entries={form.phoneDetails}
            onChange={(phoneDetails) => setForm((f) => ({ ...f, phoneDetails }))}
            disabled={saving}
          />

          <LeadContactFieldList
            kind="email"
            entries={form.emailDetails}
            onChange={(emailDetails) => setForm((f) => ({ ...f, emailDetails }))}
            disabled={saving}
          />

          {!isEdit && (
          <div>
            <label className="text-xs opacity-60 mb-1 block">Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15 resize-none"
            />
          </div>
          )}

          <ResourceSharePicker
            key={open ? (isEdit ? `edit-${editLead.id}` : fromParcel ? `parcel-${prefill.parcelId}` : 'new') : 'closed'}
            team={activeTeam}
            visibility={shareState.visibility}
            sharedMemberUids={shareState.sharedMemberUids}
            onChange={setShareState}
            disabled={saving || !canEditSharing}
            allowExternalSharing={allowExternalSharing}
            collapsible={!fromParcel}
            defaultExpanded={fromParcel}
          />

          </div>

          <div
            className="create-lead-form-footer flex justify-end gap-2 px-5 py-4 border-t border-white/20"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save' : 'Create Lead')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateLeadDialog
