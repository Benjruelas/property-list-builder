import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { SchedulePicker } from './SchedulePicker'
import { TeamMemberAssignSection } from './TeamMemberAssignSection'
import { DealPickerField } from './pickers/DealPickerField'
import { LeadPickerField } from './pickers/LeadPickerField'
import { showToast } from './ui/toast'

/**
 * Shared New task / Edit task panel — create mode matches Tasks panel (title, deal, lead, schedule, assign).
 */
export function NewTaskDialog({
  open,
  onOpenChange,
  isEditMode = false,
  showContextCard = false,
  contextPrimary = '',
  contextSecondary = '',
  contextTertiary = '',
  initialTitle = '',
  initialLeadId = null,
  initialDealId = null,
  initialScheduledAt = null,
  initialScheduledEndAt = null,
  initialDateTimeExpanded = false,
  initialTeamAssignUids = [],
  leads = [],
  deals = [],
  showDealPicker = true,
  showLeadPicker = true,
  lockLead = false,
  disableDealClear = false,
  showTeamAssign = false,
  teamMembers = [],
  teamContextActive = false,
  teamAssignTitle = 'Assign to:',
  teamAssignDescription = '',
  leadName = '',
  leadAddress = '',
  headerSubtitle = null,
  onSubmit,
  nestedOverlay = true,
  topLayer = false,
}) {
  const [title, setTitle] = useState('')
  const [leadId, setLeadId] = useState(null)
  const [dealId, setDealId] = useState(null)
  const [scheduledAt, setScheduledAt] = useState(null)
  const [scheduledEndAt, setScheduledEndAt] = useState(null)
  const [dateTimeExpanded, setDateTimeExpanded] = useState(false)
  const [teamAssignUids, setTeamAssignUids] = useState([])
  const wasOpenRef = useRef(false)
  const [pickerSession, setPickerSession] = useState(0)

  const resolveLeadFromDeal = (deal) => {
    if (!deal) return null
    if (deal.leadId) {
      const byId = leads.find((l) => l.id === deal.leadId)
      if (byId) return byId
    }
    if (deal.parcelId) {
      return leads.find((l) => String(l.parcelId) === String(deal.parcelId)) || null
    }
    return null
  }

  const handleDealChange = (deal) => {
    if (!deal) {
      setDealId(null)
      if (!lockLead) setLeadId(null)
      return
    }
    setDealId(deal.id)
    const lead = resolveLeadFromDeal(deal)
    if (lead) setLeadId(lead.id)
  }

  // Reset form only when the dialog opens — not on every parent re-render (inline [] deps caused flicker).
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setPickerSession((n) => n + 1)
    setTitle(initialTitle || '')
    const deal = initialDealId ? deals.find((d) => d.id === initialDealId) : null
    const leadFromDeal = deal ? resolveLeadFromDeal(deal) : null
    setLeadId(initialLeadId || leadFromDeal?.id || null)
    setDealId(initialDealId || null)
    setScheduledAt(initialScheduledAt ?? null)
    setScheduledEndAt(initialScheduledEndAt ?? null)
    setDateTimeExpanded(
      initialDateTimeExpanded || !!(initialScheduledAt || initialScheduledEndAt)
    )
    setTeamAssignUids(Array.isArray(initialTeamAssignUids) ? [...initialTeamAssignUids] : [])
  }, [open])

  const minScheduleDate = useMemo(() => (open ? Date.now() : 0), [open])

  const usesTeamStorage = teamAssignUids.length > 0
  const isTeamContext = teamContextActive || usesTeamStorage
  const showDealField = !isEditMode && showDealPicker
  const selectedDeal = dealId ? deals.find((d) => d.id === dealId) : null
  const selectedDealPipeline = selectedDeal?.__pipelineTitle || null

  const close = () => onOpenChange?.(false)

  const handleSave = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    const endAt =
      scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (!isTeamContext && endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    onSubmit?.({
      title: trimmed,
      scheduledAt,
      scheduledEndAt: endAt,
      assignedUids: teamAssignUids,
      leadId: leadId || null,
      dealId: dealId || null,
    })
  }

  const panelTitle = isEditMode ? 'Edit task' : 'New task'

  return (
    <Dialog open={open} modal={false} onOpenChange={onOpenChange}>
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
          <PanelHeader
            onBack={close}
            title={
              headerSubtitle ? (
                <>
                  {panelTitle}
                  <span className="block text-sm font-normal text-white/80 mt-1">{headerSubtitle}</span>
                </>
              ) : (
                panelTitle
              )
            }
          />
          <DialogTitle className="sr-only">{panelTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEditMode
              ? 'Edit task details'
              : 'Create a task. Title is required. Deal, lead, teammate, date, and time are optional.'}
          </DialogDescription>
        </DialogHeader>
        <div
          className="px-6 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 create-list-form"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {isEditMode && showContextCard && contextPrimary && (
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
              Title{' '}
              {!isEditMode && (
                <span className="text-red-400" aria-label="required">
                  *
                </span>
              )}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call back, Roof inspection"
              className="text-sm"
              autoFocus
              aria-required={!isEditMode}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
          {!isEditMode && showDealField && (
            <DealPickerField
              key={`deal-${pickerSession}`}
              deals={deals}
              value={dealId}
              onChange={handleDealChange}
              disableClear={disableDealClear}
            />
          )}
          {!isEditMode && selectedDealPipeline && (
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">Pipe</label>
              <p className="text-sm text-white/75 py-2 px-3 rounded-lg border border-white/15 bg-white/[0.04] truncate">
                {selectedDealPipeline}
              </p>
            </div>
          )}
          {!isEditMode && showLeadPicker && (
            <LeadPickerField
              key={`lead-${pickerSession}`}
              leads={leads}
              value={leadId}
              onChange={(l) => {
                if (dealId) return
                setLeadId(l?.id || null)
              }}
              readOnly={lockLead || !!dealId}
            />
          )}
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
                  endValue={isTeamContext ? null : scheduledEndAt}
                  onEndChange={isTeamContext ? undefined : setScheduledEndAt}
                  minDate={minScheduleDate}
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
              title={teamAssignTitle}
              description={teamAssignDescription}
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
