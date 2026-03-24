import { useState, useCallback } from 'react'
import { X, ChevronDown, ChevronRight, Map, Route, Mail, Database, RefreshCw, Trash2, Settings, Minus, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { DEFAULT_SETTINGS } from '../utils/settings'
import { saveUserData, readLocalBlob } from '../utils/userDataSync'
import { cn } from '@/lib/utils'

const MAP_STYLES = [
  { value: 'satellite', label: 'Satellite' },
  { value: 'street', label: 'Street' },
  { value: 'hybrid', label: 'Hybrid' },
]

const FOLLOW_DELAY_OPTIONS = [
  { value: 3000, label: '3s' },
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 0, label: 'Never' },
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

function Section({ icon: Icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="settings-section border border-white/10 rounded-lg overflow-hidden">
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

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="settings-toggle relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200"
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

const LS_DATA_KEYS = [
  'deal_pipeline_columns', 'deal_pipeline_leads', 'deal_pipeline_title',
  'lead_tasks', 'parcel_notes', 'skip_traced_parcels',
  'email_templates', 'text_templates', 'skip_trace_jobs', 'skip_traced_list',
]

export function SettingsPanel({ isOpen, onClose, settings, onSettingsChange, getToken }) {
  const [syncing, setSyncing] = useState(false)

  const update = useCallback((partial) => {
    if (onSettingsChange) onSettingsChange(partial)
  }, [onSettingsChange])

  const s = settings || DEFAULT_SETTINGS

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
        className="map-panel list-panel !w-full !max-w-none !h-full !max-h-none !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 p-0"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Application settings</DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose} title="Close">
              <X className="h-4 w-4" />
            </Button>
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
            <SettingRow label="Follow Resume Delay" description="Resume after inactivity" stacked>
              <SegmentedControl value={s.followResumeDelay} onChange={v => update({ followResumeDelay: Number(v) })} options={FOLLOW_DELAY_OPTIONS} />
            </SettingRow>
          </Section>

          {/* ---- Path Recording ---- */}
          <Section icon={Route} title="Path Recording">
            <SettingRow label="Path Smoothing" description="How much to smooth recorded paths" stacked>
              <SegmentedControl value={s.pathSmoothing} onChange={v => update({ pathSmoothing: v })} options={SMOOTHING_OPTIONS} />
            </SettingRow>
            <SettingRow label="Distance Units" stacked>
              <SegmentedControl value={s.distanceUnit} onChange={v => update({ distanceUnit: v })} options={UNIT_OPTIONS} />
            </SettingRow>
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
          </Section>

          {/* ---- Data Management ---- */}
          <Section icon={Database} title="Data Management" defaultOpen={false}>
            <div className="flex items-center gap-2">
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
                onClick={handleClearData}
                className="settings-data-btn-danger flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Local Data
              </button>
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
