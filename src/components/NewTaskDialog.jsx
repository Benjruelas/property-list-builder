import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { SchedulePicker } from './SchedulePicker'
import { TeamMemberAssignSection } from './TeamMemberAssignSection'
import { showToast } from './ui/toast'

/**
 * Shared New task / Edit task panel used across Tasks, Leads, Deals, and Create Deal.
 */
export function NewTaskDialog({
  open,
  onOpenChange,
  isEditMode = false,
  showContextCard = true,
  contextPrimary = '',
  contextSecondary = '',
  contextTertiary = '',
  initialTitle = '',
  initialScheduledAt = null,
  initialScheduledEndAt = null,
  initialTeamAssignUids = [],
  showTeamAssign = false,
  teamMembers = [],
  teamContextActive = false,
  leadName = '',
  leadAddress = '',
  onSubmit,
  nestedOverlay = true,
  topLayer = false,
}) {
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState(null)
  const [scheduledEndAt, setScheduledEndAt] = useState(null)
  const [dateTimeExpanded, setDateTimeExpanded] = useState(false)
  const [teamAssignUids, setTeamAssignUids] = useState([])

  useEffect(() => {
    if (!open) return
    setTitle(initialTitle || '')
    setScheduledAt(initialScheduledAt ?? null)
    setScheduledEndAt(initialScheduledEndAt ?? null)
    setDateTimeExpanded(!!(initialScheduledAt || initialScheduledEndAt))
    setTeamAssignUids(Array.isArray(initialTeamAssignUids) ? [...initialTeamAssignUids] : [])
  }, [
    open,
    initialTitle,
    initialScheduledAt,
    initialScheduledEndAt,
    initialTeamAssignUids,
  ])

  const close = () => onOpenChange?.(false)

  const handleSave = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    const endAt =
      scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (!teamContextActive && endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    onSubmit?.({
      title: trimmed,
      scheduledAt,
      scheduledEndAt: endAt,
      assignedUids: teamAssignUids,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel list-panel new-task-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
      >
        <DialogHeader
          className="px-6 pt-6 pb-2 border-b border-white/20 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <PanelHeader onBack={close} title={isEditMode ? 'Edit task' : 'New task'} />
          <DialogDescription className="sr-only">
            {isEditMode ? 'Edit task details' : 'Create a new task'}
          </DialogDescription>
        </DialogHeader>
        <div
          className="px-6 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 create-list-form"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {showContextCard && contextPrimary && (
            <div className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5">
              <div className="text-sm font-medium truncate">{contextPrimary}</div>
              {contextSecondary && (
                <div className="text-xs opacity-60 truncate mt-0.5">{contextSecondary}</div>
              )}
              {contextTertiary && (
                <div className="text-xs opacity-50 truncate mt-0.5">{contextTertiary}</div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-medium block mb-1 opacity-90">
              Task title{' '}
              <span className="text-red-400" aria-label="required">
                *
              </span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call back, Roof inspection"
              className="text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden">
            <button
              type="button"
              onClick={() => setDateTimeExpanded((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-white/90 hover:bg-white/5 transition-colors"
              aria-expanded={dateTimeExpanded}
            >
              {dateTimeExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
              )}
              <span>Date &amp; time</span>
            </button>
            {dateTimeExpanded && (
              <div className="border-t border-white/15 px-3 pb-3 pt-2 space-y-1">
                <SchedulePicker
                  inline
                  hideLabel
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  endValue={teamContextActive ? null : scheduledEndAt}
                  onEndChange={teamContextActive ? undefined : setScheduledEndAt}
                  minDate={Date.now()}
                  leadName={leadName || contextPrimary}
                  leadAddress={leadAddress || contextTertiary || contextSecondary}
                />
              </div>
            )}
          </div>
          {showTeamAssign && (
            <TeamMemberAssignSection
              members={teamMembers}
              selectedUids={teamAssignUids}
              onToggle={(uid) => {
                setTeamAssignUids((prev) =>
                  prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
                )
              }}
            />
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={handleSave}>
              {isEditMode ? 'Save' : 'Create'}
            </Button>
            <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default NewTaskDialog
