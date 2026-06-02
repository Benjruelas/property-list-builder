import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { PanelHeader } from './ui/panel-header'
import { cn } from '@/lib/utils'
import {
  TEAM_FEATURE_IDS,
  TEAM_FEATURE_LABELS,
  normalizeMemberFeatures,
} from '@/utils/teamFeatures'

export function TeamMemberFeaturesDialog({
  open,
  member,
  onClose,
  onSave,
  saving = false,
}) {
  const [features, setFeatures] = useState(() => normalizeMemberFeatures(null))

  useEffect(() => {
    if (open && member) {
      setFeatures(normalizeMemberFeatures(member.features))
    }
  }, [open, member])

  if (!member) return null

  const toggle = (id) => {
    setFeatures((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const enabledCount = TEAM_FEATURE_IDS.filter((id) => features[id]).length

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.() }}>
      <DialogContent className="map-panel list-panel max-w-md p-0" showCloseButton nestedOverlay topLayer>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20 text-left">
          <PanelHeader onBack={onClose} title="Feature access" />
          <DialogDescription className="sr-only">Configure team member feature access</DialogDescription>
          <p className="text-sm text-white/70 mt-2 truncate">{member.email || member.uid}</p>
        </DialogHeader>
        <div className="px-6 py-4 space-y-3">
          <p className="text-xs opacity-60">
            Choose which parts of the app this member can use. Admins always have full access.
          </p>
          <ul className="space-y-1">
            {TEAM_FEATURE_IDS.map((id) => {
              const on = features[id] !== false
              return (
                <li key={id}>
                  <label
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                      on ? 'border-white/15 bg-white/[0.04]' : 'border-white/10 bg-white/[0.02] opacity-70'
                    )}
                  >
                    <span className="text-sm">{TEAM_FEATURE_LABELS[id]}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggle(id)}
                      className={cn(
                        'relative h-5 w-9 rounded-full transition-colors shrink-0',
                        on ? 'bg-blue-500' : 'bg-white/20'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                          on ? 'left-4' : 'left-0.5'
                        )}
                      />
                    </button>
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] opacity-50">{enabledCount} of {TEAM_FEATURE_IDS.length} enabled</p>
          <div className="flex gap-2 pt-1">
            <Button className="create-list-btn flex-1" onClick={() => onSave?.(features)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
            <Button variant="outline" className="create-list-btn flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
