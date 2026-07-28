import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { SchedulePicker } from './SchedulePicker'
import { TeamMemberAssignSection } from './TeamMemberAssignSection'
import { DealPickerField } from './pickers/DealPickerField'
import { LeadPickerField } from './pickers/LeadPickerField'
import { displayLeadName } from '@/utils/leads'
import { filterDealsForLead } from './pickers/entityPickerShared'
import { showToast } from './ui/toast'
import { handleChildPanelDismiss } from './ui/panelDialogUtils'
import { useNavigationOptional } from '@/navigation/NavigationContext'

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
  lockDeal = false,
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
  onCreateLead,
  saving = false,
  nestedOverlay = true,
  topLayer: topLayerProp,
}) {
  const topLayer = topLayerProp ?? nestedOverlay
  const [title, setTitle] = useState('')
  const [leadId, setLeadId] = useState(null)
  const [dealId, setDealId] = useState(null)
  const [scheduledAt, setScheduledAt] = useState(null)
  const [scheduledEndAt, setScheduledEndAt] = useState(null)
  const [dateTimeExpanded, setDateTimeExpanded] = useState(false)
  const [teamAssignUids, setTeamAssignUids] = useState([])
  const wasOpenRef = useRef(false)
  const [pickerSession, setPickerSession] = useState(0)
  const [pendingCreatedLead, setPendingCreatedLead] = useState(null)
  const suppressDismissAfterCreateLeadRef = useRef(false)
  const scheduleRef = useRef({ scheduledAt: null, scheduledEndAt: null })
  const nav = useNavigationOptional()
  const createLeadOpen = nav?.panelProps?.createLeadOpen ?? false

  const resolveLeadFromDeal = (deal) => {
    if (!deal) return null
    if (deal.leadId) {
      const byId = leads.find((l) => l.id === deal.leadId)
      if (byId) return byId
    }
    if (deal.parcelId) {
      const byParcel = leads.find((l) => String(l.parcelId) === String(deal.parcelId))
      if (byParcel) return byParcel
    }
    const dealLeadName = (deal.leadName || '').trim().toLowerCase()
    if (dealLeadName) {
      const byName = leads.find((l) => displayLeadName(l).trim().toLowerCase() === dealLeadName)
      if (byName) return byName
    }
    return null
  }

  const applyLeadFromDeal = (deal) => {
    const lead = resolveLeadFromDeal(deal)
    if (lead) setLeadId(lead.id)
  }

  const handleDealChange = (deal) => {
    if (lockDeal) return
    if (!deal) {
      setDealId(null)
      return
    }
    setDealId(deal.id)
    applyLeadFromDeal(deal)
  }

  // Reset form only when the dialog opens — not on every parent re-render (inline [] deps caused flicker).
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      setPendingCreatedLead(null)
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setPickerSession((n) => n + 1)
    setPendingCreatedLead(null)
    setTitle(initialTitle || '')
    const deal = initialDealId ? deals.find((d) => d.id === initialDealId) : null
    const leadFromDeal = deal ? resolveLeadFromDeal(deal) : null
    setLeadId(initialLeadId || leadFromDeal?.id || null)
    setDealId(initialDealId || null)
    setScheduledAt(initialScheduledAt ?? null)
    setScheduledEndAt(initialScheduledEndAt ?? null)
    scheduleRef.current = {
      scheduledAt: initialScheduledAt ?? null,
      scheduledEndAt: initialScheduledEndAt ?? null,
    }
    setDateTimeExpanded(
      initialDateTimeExpanded || !!(initialScheduledAt || initialScheduledEndAt)
    )
    setTeamAssignUids(Array.isArray(initialTeamAssignUids) ? [...initialTeamAssignUids] : [])
  }, [open])

  useEffect(() => {
    if (!open || !dealId) return
    const deal = deals.find((d) => d.id === dealId)
    if (!deal) return
    const lead = resolveLeadFromDeal(deal)
    if (lead && lead.id !== leadId) setLeadId(lead.id)
  }, [open, dealId, deals, leads, leadId])

  useEffect(() => {
    if (!pendingCreatedLead?.id) return
    if (leads.some((l) => l.id === pendingCreatedLead.id)) {
      setPendingCreatedLead(null)
    }
  }, [leads, pendingCreatedLead])

  const minScheduleDate = useMemo(() => {
    if (!open) return 0
    if (isEditMode) return 0
    return Date.now()
  }, [open, isEditMode])

  const pickerLeads = useMemo(() => {
    if (!pendingCreatedLead?.id) return leads
    if (leads.some((l) => l.id === pendingCreatedLead.id)) return leads
    return [pendingCreatedLead, ...leads]
  }, [leads, pendingCreatedLead])

  const isDueAtOnlyTask = teamContextActive
  const selectedLead = useMemo(
    () => (leadId ? pickerLeads.find((l) => l.id === leadId) : null),
    [pickerLeads, leadId]
  )
  const dealsForSelectedLead = useMemo(
    () => (leadId ? filterDealsForLead(deals, selectedLead) : deals),
    [deals, leadId, selectedLead]
  )
  const leadHasDeals = dealsForSelectedLead.length > 0
  const selectedDeal = dealId ? deals.find((d) => d.id === dealId) : null
  const selectedDealPipeline = selectedDeal?.__pipelineTitle || null
  const showLeadField = showLeadPicker && !dealId
  const showDealField = showDealPicker && (!leadId || leadHasDeals || !!dealId)
  const pickerDeals = dealId ? deals : (leadId ? dealsForSelectedLead : deals)
  const canCreateLead = showLeadField && onCreateLead && !lockLead

  const handleDialogOpenChange = (nextOpen) => {
    if (!nextOpen) {
      if (saving) return
      if (suppressDismissAfterCreateLeadRef.current) {
        suppressDismissAfterCreateLeadRef.current = false
        return
      }
      handleChildPanelDismiss(nextOpen, () => onOpenChange?.(false), {
        wasOpen: open,
        hasNestedOverlay: createLeadOpen,
      })
      return
    }
    onOpenChange?.(true)
  }

  const close = () => {
    if (saving) return
    onOpenChange?.(false)
  }

  const setScheduledAtTracked = (value) => {
    scheduleRef.current = { ...scheduleRef.current, scheduledAt: value }
    setScheduledAt(value)
  }

  const setScheduledEndAtTracked = (value) => {
    scheduleRef.current = { ...scheduleRef.current, scheduledEndAt: value }
    setScheduledEndAt(value)
  }

  const flushScheduleFocus = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
  }

  const handleSave = () => {
    if (saving) return
    flushScheduleFocus()
    const trimmed = title.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    const at = scheduleRef.current.scheduledAt
    const endRaw = scheduleRef.current.scheduledEndAt
    const endAt = endRaw && endRaw > (at || 0) ? endRaw : null
    if (!isDueAtOnlyTask && endAt && at && endAt <= at) {
      showToast('End time must be after start time', 'error')
      return
    }
    const deal = dealId ? deals.find((d) => d.id === dealId) : null
    const resolvedLeadId = leadId || resolveLeadFromDeal(deal)?.id || null
    onSubmit?.({
      title: trimmed,
      scheduledAt: at,
      scheduledEndAt: endAt,
      assignedUids: teamAssignUids,
      leadId: resolvedLeadId,
      dealId: dealId || null,
    })
  }

  const panelTitle = isEditMode ? 'Edit task' : 'New task'

  return (
    <Dialog open={open} modal={false} onOpenChange={handleDialogOpenChange}>
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
          className="new-task-form-body px-6 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 create-list-form"
          style={{ paddingBottom: '0.75rem' }}
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
              onKeyDown={(e) => e.key === 'Enter' && !saving && handleSave()}
            />
          </div>
          {showLeadField && (
            <LeadPickerField
              key={`lead-${pickerSession}`}
              collapsible
              leads={pickerLeads}
              value={leadId}
              onChange={(l) => {
                if (dealId || lockLead) return
                setLeadId(l?.id || null)
              }}
              readOnly={lockLead || !!dealId}
              onCreateLead={
                canCreateLead
                  ? () => {
                      suppressDismissAfterCreateLeadRef.current = true
                      onCreateLead((lead) => {
                        setPendingCreatedLead(lead)
                        setLeadId(lead?.id ?? null)
                      })
                    }
                  : undefined
              }
            />
          )}
          {showDealField && (
            <DealPickerField
              key={`deal-${pickerSession}`}
              collapsible
              deals={pickerDeals}
              value={dealId}
              onChange={handleDealChange}
              disableClear={disableDealClear || lockDeal}
            />
          )}
          {selectedDealPipeline && (
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">Pipe</label>
              <p className="text-sm text-white/75 py-2 px-3 rounded-lg border border-white/15 bg-white/[0.04] truncate">
                {selectedDealPipeline}
              </p>
            </div>
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
                  onChange={setScheduledAtTracked}
                  endValue={isDueAtOnlyTask ? null : scheduledEndAt}
                  onEndChange={isDueAtOnlyTask ? undefined : setScheduledEndAtTracked}
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
              onClearAll={() => setTeamAssignUids([])}
              onToggle={(uid) => {
                setTeamAssignUids((prev) =>
                  prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
                )
              }}
            />
          )}
        </div>
        <div
          className="new-task-form-footer shrink-0 flex gap-2 px-6 py-3 border-t border-white/20"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button
            size="sm"
            variant="outline"
            className="create-list-btn flex-1 md:flex-none md:min-w-[7.5rem]"
            onMouseDown={flushScheduleFocus}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEditMode ? 'Save' : 'Create')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="create-list-btn flex-1 md:flex-none md:min-w-[7.5rem]"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default NewTaskDialog
