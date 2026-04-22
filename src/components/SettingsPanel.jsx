import { useState, useCallback, useEffect } from 'react'
import { X, ChevronDown, ChevronRight, Map, Route, Mail, Database, RefreshCw, Trash2, Settings, Minus, Plus, Bell, HelpCircle, LogOut, Phone, Users, Smartphone } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { DEFAULT_SETTINGS } from '../utils/settings'
import { saveUserData, readLocalBlob } from '../utils/userDataSync'
import { subscribeToWebPush, unsubscribeWebPush } from '../utils/pushNotifications'
import { cn } from '@/lib/utils'
import { getSkipTracedList } from '../utils/skipTracedList'
import { useAuth } from '@/contexts/AuthContext'

const MAP_STYLES = [
  { value: 'satellite', label: 'Satellite' },
  { value: 'street', label: 'Street' },
  { value: 'hybrid', label: 'Hybrid' },
]

const BOUNDARY_COLORS = [
  { value: '#2563eb', label: 'Blue' },
  { value: '#ffffff', label: 'White' },
  { value: '#ef4444', label: 'Red' },
  { value: '#22c55e', label: 'Green' },
  { value: '#f97316', label: 'Orange' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#ec4899', label: 'Pink' },
]

const SMOOTHING_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'normal', label: 'Normal' },
  { value: 'heavy', label: 'Heavy' },
]

const UNIT_OPTIONS = [
  { value: 'miles', label: 'Miles' },
  { value: 'km', label: 'Km' },
]

const MOBILE_ACTION_BAR_OPTIONS = [
  { value: 'classic',  label: 'Classic' },
  { value: 'floating', label: 'Floating' },
  { value: 'rail',     label: 'Rail' },
  { value: 'off',      label: 'Off' },
]

const DEADLINE_LEAD_OPTIONS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
]

function Section({ icon: Icon, title, children, defaultOpen = true, dataTour }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="settings-section border border-white/10 rounded-lg overflow-hidden" data-tour={dataTour || undefined}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-white/5 transition-colors"
      >
        <Icon className="h-4 w-4 flex-shrink-0 opacity-70" />
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  )
}

function SettingRow({ label, description, children, stacked }) {
  if (stacked) {
    return (
      <div>
        <div className="mb-2">
          <div className="text-sm font-medium">{label}</div>
          {description && <div className="text-xs opacity-50 mt-0.5">{description}</div>}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs opacity-50 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'settings-toggle relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full transition-all duration-200",
          checked ? "translate-x-[24px] toggle-knob-on" : "translate-x-[4px] toggle-knob-off"
        )}
      />
    </button>
  )
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="settings-segmented inline-flex rounded-lg p-0.5 gap-0.5">
      {options.map(o => {
        const active = String(value) === String(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all duration-150",
              active && "seg-active"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function ZoomSlider({ value, min = 14, max = 19, onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="settings-zoom-slider flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-md border border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
        disabled={value <= min}
      >
        <Minus className={cn("h-3.5 w-3.5", value <= min ? "opacity-25" : "opacity-70")} />
      </button>
      <div className="relative flex-1 h-7 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/40"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="settings-range-input absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute h-4 w-4 rounded-full bg-white border-2 border-white/60 pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-md border border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
        disabled={value >= max}
      >
        <Plus className={cn("h-3.5 w-3.5", value >= max ? "opacity-25" : "opacity-70")} />
      </button>
    </div>
  )
}

function OpacitySlider({ value, onChange }) {
  const pct = value
  return (
    <div className="settings-zoom-slider flex items-center gap-3 w-full">
      <span className="flex-shrink-0 text-[11px] font-medium text-white/50 w-5 text-right">0</span>
      <div className="relative flex-1 h-7 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/40"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="settings-range-input absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute h-4 w-4 rounded-full bg-white border-2 border-white/60 pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
      <span className="flex-shrink-0 text-[11px] font-medium text-white/50 w-7">100</span>
    </div>
  )
}

const LS_DATA_KEYS = [
  'deal_pipeline_columns', 'deal_pipeline_leads', 'deal_pipeline_title',
  'lead_tasks', 'parcel_notes', 'skip_traced_parcels',
  'email_templates', 'text_templates', 'skip_trace_jobs', 'skip_traced_list',
]

export function SettingsPanel({ isOpen, onClose, settings, onSettingsChange, parcelBoundaryColor, onBoundaryColorChange, onBoundaryOpacityChange, getToken, onRestartTour, onLogout, onOpenParcelDetails }) {
  const { devPersona, switchDevPersona, DEV_PERSONA_A, DEV_PERSONA_B, currentUser } = useAuth()
  const showDevPersonaSwitcher = import.meta.env.DEV && typeof switchDevPersona === 'function'
  const [syncing, setSyncing] = useState(false)
  const [skipTracedList, setSkipTracedList] = useState(null)
  const [expandedSkipTracedLists, setExpandedSkipTracedLists] = useState(new Set())

  useEffect(() => {
    if (isOpen) {
      setSkipTracedList(getSkipTracedList())
    } else {
      setSkipTracedList(null)
      setExpandedSkipTracedLists(new Set())
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const id = setInterval(() => setSkipTracedList(getSkipTracedList()), 2000)
    return () => clearInterval(id)
  }, [isOpen])

  const update = useCallback((partial) => {
    if (onSettingsChange) onSettingsChange(partial)
  }, [onSettingsChange])

  const s = settings || DEFAULT_SETTINGS
  const n = { ...DEFAULT_SETTINGS.notifications, ...(s.notifications || {}) }

  const handlePushMasterToggle = useCallback(async (on) => {
    const base = { ...DEFAULT_SETTINGS.notifications, ...(settings?.notifications || {}) }
    if (on) {
      if (typeof Notification === 'undefined') {
        showToast('Notifications are not supported in this browser', 'error')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        showToast('Notification permission denied', 'error')
        return
      }
      update({ notifications: { ...base, pushEnabled: true } })
      if (getToken) {
        const ok = await subscribeToWebPush(getToken)
        if (!ok) {
          showToast('Could not enable server push. Sign in and ensure VAPID keys are set.', 'warning')
        }
      }
    } else {
      if (getToken) await unsubscribeWebPush(getToken)
      update({ notifications: { ...base, pushEnabled: false } })
    }
  }, [getToken, settings?.notifications, update])

  const handleClearData = useCallback(async () => {
    const confirmed = await showConfirm(
      'This will clear all locally cached data (pipeline, notes, templates, skip traces). Your lists and paths stored on the server are not affected. Continue?',
      'Clear Local Data'
    )
    if (!confirmed) return
    for (const key of LS_DATA_KEYS) {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }
    showToast('Local data cleared', 'success')
  }, [])

  const handleResetSkipTraces = useCallback(async () => {
    const confirmed = await showConfirm(
      'Delete all skip-traced contact info (phones, emails, caller IDs) for every parcel you\'ve traced, on this device AND on the server? This lets you re-run skip trace on those parcels. Your lists, notes, and pipeline are unaffected.',
      'Reset Skip Traces'
    )
    if (!confirmed) return

    for (const key of ['skip_traced_parcels', 'skip_traced_list', 'skip_trace_jobs']) {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }

    if (getToken) {
      try {
        await saveUserData(getToken, {
          skipTracedParcels: {},
          skipTracedList: null,
          skipTraceJobs: []
        })
        showToast('Skip traces cleared locally and on the server', 'success')
      } catch (e) {
        showToast(`Local cleared, but server wipe failed: ${e.message || 'unknown error'}`, 'warning')
      }
    } else {
      showToast('Skip traces cleared locally (sign in to wipe server copy too)', 'warning')
    }

    setTimeout(() => window.location.reload(), 500)
  }, [getToken])

  const handleSyncNow = useCallback(async () => {
    if (!getToken) {
      showToast('Sign in to sync data', 'error')
      return
    }
    setSyncing(true)
    try {
      const blob = readLocalBlob()
      await saveUserData(getToken, blob)
      showToast('Data synced to server', 'success')
    } catch (e) {
      showToast(e.message || 'Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }, [getToken])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Application settings</DialogDescription>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold flex items-center gap-2 min-w-0 truncate">
              <Settings className="h-5 w-5 shrink-0" />
              <span className="truncate">Settings</span>
            </DialogTitle>
            <div className="map-panel-header-actions">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-4 py-4 overflow-y-auto scrollbar-hide flex-1 space-y-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* ---- Map ---- */}
          <Section icon={Map} title="Map">
            <SettingRow label="Map Style" description="Base map tile layer" stacked>
              <SegmentedControl value={s.mapStyle} onChange={v => update({ mapStyle: v })} options={MAP_STYLES} />
            </SettingRow>
            <SettingRow label="Default Zoom" description="Zoom level on app launch" stacked>
              <ZoomSlider value={s.defaultZoom} onChange={v => update({ defaultZoom: v })} />
            </SettingRow>
            <SettingRow label="Compass On by Default" description="Rotate map to match device heading">
              <Toggle checked={s.compassDefault} onChange={v => update({ compassDefault: v })} />
            </SettingRow>
            <SettingRow label="Auto-Follow" description="Pan map to keep your location centered">
              <Toggle checked={s.autoFollow} onChange={v => update({ autoFollow: v })} />
            </SettingRow>
            <SettingRow label="Parcel Boundary Color" description="Outline color for property parcels" stacked>
              <div className="flex flex-wrap gap-2">
                {BOUNDARY_COLORS.map(c => {
                  const currentColor = s.parcelBoundaryColor || parcelBoundaryColor || '#2563eb'
                  const active = currentColor === c.value
                  const applyColor = () => {
                    update({ parcelBoundaryColor: c.value })
                    onBoundaryColorChange?.(c.value)
                  }
                  return (
                    <div
                      key={c.value}
                      tabIndex={0}
                      title={c.label}
                      onClick={applyColor}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') applyColor() }}
                      className={cn(
                        "color-swatch h-8 w-8 rounded-full cursor-pointer transition-transform duration-150 flex-shrink-0",
                        active ? "scale-110 ring-2 ring-white/40 border-2 border-white" : "border-2 border-white/25 hover:scale-105 hover:border-white/50"
                      )}
                      style={{ '--swatch-bg': c.value }}
                    />
                  )
                })}
              </div>
            </SettingRow>
            <SettingRow label="Boundary Opacity" description="Default opacity for parcel outlines" stacked>
              <OpacitySlider value={s.parcelBoundaryOpacity ?? 80} onChange={v => { update({ parcelBoundaryOpacity: v }); onBoundaryOpacityChange?.(v) }} />
            </SettingRow>
          </Section>

          {/* ---- Mobile ---- */}
          <Section icon={Smartphone} title="Mobile">
            <SettingRow
              label="Action Bar Style"
              description="Permanent bottom bar for Pipes, Tasks and Schedule on phones"
              stacked
            >
              <SegmentedControl
                value={s.mobileActionBar || 'classic'}
                onChange={v => update({ mobileActionBar: v })}
                options={MOBILE_ACTION_BAR_OPTIONS}
              />
            </SettingRow>
          </Section>

          {showDevPersonaSwitcher && (
            <Section icon={Users} title="Local dev user" defaultOpen>
              <p className="text-xs opacity-50 -mt-1">
                Switch between two synthetic users to test list and pipe sharing. The page reloads; use two browser profiles with different personas for side-by-side testing.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={devPersona === DEV_PERSONA_A ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 min-w-[8rem]"
                  onClick={() => switchDevPersona(DEV_PERSONA_A)}
                >
                  User A (dev@localhost)
                </Button>
                <Button
                  type="button"
                  variant={devPersona === DEV_PERSONA_B ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 min-w-[8rem]"
                  onClick={() => switchDevPersona(DEV_PERSONA_B)}
                >
                  User B (dev2@localhost)
                </Button>
              </div>
              <p className="text-xs opacity-40">Active: {currentUser?.email ?? '—'}</p>
            </Section>
          )}

          {/* ---- Path Recording ---- */}
          <Section icon={Route} title="Path Recording">
            <SettingRow label="Path Smoothing" description="How much to smooth recorded paths" stacked>
              <SegmentedControl value={s.pathSmoothing} onChange={v => update({ pathSmoothing: v })} options={SMOOTHING_OPTIONS} />
            </SettingRow>
            <SettingRow label="Distance Units" stacked>
              <SegmentedControl value={s.distanceUnit} onChange={v => update({ distanceUnit: v })} options={UNIT_OPTIONS} />
            </SettingRow>
          </Section>

          {/* ---- Skip Traced Parcels ---- */}
          <Section icon={Phone} title="Skip Traced Parcels" defaultOpen={false} dataTour="settings-skip-traced-section">
            {(!skipTracedList || (skipTracedList.parcels.length === 0 && skipTracedList.listItems.length === 0)) ? (
              <p className="text-xs opacity-50 -mt-1">No skip traced parcels yet.</p>
            ) : (
              <div className="space-y-3 -mt-1">
                {skipTracedList.parcels.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold opacity-60 uppercase tracking-wide">Individual Parcels ({skipTracedList.parcels.length})</h4>
                    {skipTracedList.parcels.map((parcel, index) => {
                      const parcelId = parcel.id || parcel.properties?.PROP_ID || `parcel-${index}`
                      const addr = parcel.properties?.SITUS_ADDR || parcel.properties?.SITE_ADDR || parcel.properties?.ADDRESS || parcel.address || 'No address'
                      return (
                        <button
                          key={parcelId}
                          type="button"
                          className="w-full text-left p-2.5 rounded-lg border border-white/15 hover:border-white/30 hover:bg-white/5 transition-colors"
                          onClick={() => {
                            if (!onOpenParcelDetails) return
                            onClose?.()
                            onOpenParcelDetails({
                              id: parcelId,
                              properties: parcel.properties || parcel,
                              address: addr,
                              lat: parcel.lat || parcel.properties?.LATITUDE ? parseFloat(parcel.lat || parcel.properties?.LATITUDE) : null,
                              lng: parcel.lng || parcel.properties?.LONGITUDE ? parseFloat(parcel.lng || parcel.properties?.LONGITUDE) : null,
                            })
                          }}
                        >
                          <div className="text-sm font-medium truncate">{addr}</div>
                          {parcel.skipTracedAt && <div className="text-xs opacity-50">{new Date(parcel.skipTracedAt).toLocaleDateString()}</div>}
                        </button>
                      )
                    })}
                  </div>
                )}
                {skipTracedList.listItems.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold opacity-60 uppercase tracking-wide">Skip Traced Lists ({skipTracedList.listItems.length})</h4>
                    {skipTracedList.listItems.map((listItem) => {
                      const isExpanded = expandedSkipTracedLists.has(listItem.listId)
                      return (
                        <div key={listItem.listId} className="rounded-lg border border-white/15">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-white/5 transition-colors rounded-lg"
                            onClick={() => setExpandedSkipTracedLists(prev => {
                              const next = new Set(prev)
                              next.has(listItem.listId) ? next.delete(listItem.listId) : next.add(listItem.listId)
                              return next
                            })}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 opacity-60 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 opacity-60 flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{listItem.listName}</div>
                              <div className="text-xs opacity-50">{listItem.parcels.length} parcel{listItem.parcels.length !== 1 ? 's' : ''}{listItem.skipTracedAt ? ` • ${new Date(listItem.skipTracedAt).toLocaleDateString()}` : ''}</div>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-2.5 pb-2.5 pt-1 space-y-1 border-t border-white/10">
                              {listItem.parcels.map((parcel, idx) => {
                                const pid = parcel.id || parcel.properties?.PROP_ID || `p-${idx}`
                                const addr = parcel.properties?.SITUS_ADDR || parcel.properties?.SITE_ADDR || parcel.properties?.ADDRESS || parcel.address || 'No address'
                                return (
                                  <button
                                    key={pid}
                                    type="button"
                                    className="w-full text-left p-2 rounded border border-white/10 hover:border-white/25 hover:bg-white/5 transition-colors text-sm"
                                    onClick={() => {
                                      if (!onOpenParcelDetails) return
                                      onClose?.()
                                      onOpenParcelDetails({
                                        id: pid,
                                        properties: parcel.properties || parcel,
                                        address: addr,
                                        lat: parcel.lat || parcel.properties?.LATITUDE ? parseFloat(parcel.lat || parcel.properties?.LATITUDE) : null,
                                        lng: parcel.lng || parcel.properties?.LONGITUDE ? parseFloat(parcel.lng || parcel.properties?.LONGITUDE) : null,
                                      })
                                    }}
                                  >
                                    <div className="font-medium truncate">{addr}</div>
                                    {parcel.skipTracedAt && <div className="text-xs opacity-50">{new Date(parcel.skipTracedAt).toLocaleDateString()}</div>}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ---- Email & Export ---- */}
          <Section icon={Mail} title="Email & Export">
            <SettingRow label="Email Test Mode" description="Route all emails to the address below instead of real recipients">
              <Toggle checked={s.emailTestMode} onChange={v => update({ emailTestMode: v })} />
            </SettingRow>
            <div>
              <label className="block text-sm font-medium mb-1">Test Email Address</label>
              <p className="text-xs opacity-50 mb-1.5">Used when test mode is on, or for CSV exports</p>
              <input
                type="email"
                value={s.defaultEmail}
                onChange={e => update({ defaultEmail: e.target.value })}
                placeholder="your@email.com"
                className="w-full text-sm rounded-lg px-3 py-2"
              />
            </div>
            <SettingRow label="Email Signature" description="Append a signature to the end of all outgoing emails">
              <Toggle checked={s.emailSignatureEnabled} onChange={v => update({ emailSignatureEnabled: v })} />
            </SettingRow>
            {s.emailSignatureEnabled && (
              <div>
                <textarea
                  value={s.emailSignature}
                  onChange={e => update({ emailSignature: e.target.value })}
                  placeholder="e.g. Best regards,&#10;John Doe&#10;(555) 123-4567"
                  className="w-full text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y"
                  rows={3}
                />
              </div>
            )}
          </Section>

          {/* ---- Notifications ---- */}
          <Section icon={Bell} title="Notifications" defaultOpen>
            <p className="text-xs opacity-50 -mt-1 mb-2">
              Server alerts require signing in. Skip trace and task reminders use this device when the app is open or in the background.
            </p>
            <SettingRow label="Enable notifications" description="Browser permission + web push when signed in">
              <Toggle checked={n.pushEnabled} onChange={handlePushMasterToggle} />
            </SettingRow>
            {n.pushEnabled && (
              <>
                <SettingRow label="List shared with you" description="When someone adds you to a list">
                  <Toggle
                    checked={n.listShared}
                    onChange={(v) => update({ notifications: { ...n, listShared: v } })}
                    disabled={!getToken}
                  />
                </SettingRow>
                <SettingRow label="Pipeline shared with you" description="When someone adds you to a pipeline">
                  <Toggle
                    checked={n.pipelineShared}
                    onChange={(v) => update({ notifications: { ...n, pipelineShared: v } })}
                    disabled={!getToken}
                  />
                </SettingRow>
                <SettingRow label="Lead stage changes" description="When a lead moves columns in a shared pipeline">
                  <Toggle
                    checked={n.pipelineLeadStage}
                    onChange={(v) => update({ notifications: { ...n, pipelineLeadStage: v } })}
                    disabled={!getToken}
                  />
                </SettingRow>
                <SettingRow label="Skip trace finished" description="When bulk skip trace completes for a list">
                  <Toggle
                    checked={n.skipTraceComplete}
                    onChange={(v) => update({ notifications: { ...n, skipTraceComplete: v } })}
                  />
                </SettingRow>
                <SettingRow label="Task deadline reminders" description="Before a scheduled task time">
                  <Toggle
                    checked={n.taskDeadline}
                    onChange={(v) => update({ notifications: { ...n, taskDeadline: v } })}
                  />
                </SettingRow>
                {n.taskDeadline && (
                  <div className="mt-1">
                    <SegmentedControl
                      value={n.taskDeadlineLeadMinutes}
                      onChange={(v) => update({ notifications: { ...n, taskDeadlineLeadMinutes: Number(v) } })}
                      options={DEADLINE_LEAD_OPTIONS}
                    />
                  </div>
                )}
              </>
            )}
          </Section>

          {/* ---- Data Management ---- */}
          <Section icon={Database} title="Data Management" defaultOpen={false}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                className="settings-data-btn flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                onClick={handleResetSkipTraces}
                className="settings-data-btn-danger flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors"
                title="Wipe all skip-traced contact info (local + server) so parcels can be re-traced"
              >
                <Phone className="h-3.5 w-3.5" />
                Reset Skip Traces
              </button>
              <button
                type="button"
                onClick={handleClearData}
                className="settings-data-btn-danger flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Local Data
              </button>
            </div>
          </Section>

          {/* ---- Restart Welcome Tour ---- */}
          {onRestartTour && (
            <button
              type="button"
              onClick={onRestartTour}
              className="settings-data-btn w-full flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded-lg transition-colors"
            >
              <HelpCircle className="h-4 w-4 opacity-70" />
              Restart Welcome Tour
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={async () => {
                onClose?.()
                await onLogout()
              }}
              className="settings-data-btn-danger w-full flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
