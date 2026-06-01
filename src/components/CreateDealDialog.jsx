import { useMemo, useState, useEffect, useRef } from 'react'
import { Briefcase, Loader2, Search, X } from 'lucide-react'
import { Button } from './ui/button'
import { PanelHeader } from './ui/panel-header'
import { PipelineDropdown } from './PipelineDropdown'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { cn } from '@/lib/utils'
import { CreateDealFinancesEditor, mapPrefillFinanceRows, financeRowsForSubmit } from './CreateDealFinancesEditor'
import { CreateDealTasksEditor, mapPrefillTaskRows, taskRowsForSubmit } from './CreateDealTasksEditor'

const leadRowClass =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-0.5 w-full text-left px-3.5 py-3 rounded-lg border transition-all cursor-pointer'

function filterLeads(leads, query) {
  const q = query.toLowerCase().trim()
  const sorted = [...leads].sort((a, b) =>
    (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
  )
  if (!q) return sorted
  const tokens = q.split(/\s+/).filter(Boolean)
  return sorted.filter((lead) => {
    const name = displayLeadName(lead).toLowerCase()
    const address = (lead.address || '').toLowerCase()
    const email = (lead.email || '').toLowerCase()
    const phone = (lead.phone || '').toLowerCase()
    const searchable = [name, address, email, phone].filter(Boolean).join(' ')
    return tokens.every((tok) => searchable.includes(tok))
  })
}

function SelectedLeadCard({ lead, onClear }) {
  return (
    <div
      className={cn(
        leadRowClass,
        'border-white/20 bg-white/[0.06] cursor-default flex-row items-center justify-between gap-3'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{displayLeadName(lead)}</div>
        <div className="text-xs opacity-60 truncate" title={lead.address || undefined}>
          {formatLeadAddress(lead) || 'No address'}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 opacity-60 hover:opacity-100"
        onClick={onClear}
        aria-label="Clear lead selection"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function CreateDealDialog({
  open,
  onOpenChange,
  leads = [],
  pipelines = [],
  teams = [],
  prefill = null,
  onSubmit,
  saving = false,
  nestedOverlay = true,
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [pipelineId, setPipelineId] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [leadPickerOpen, setLeadPickerOpen] = useState(true)
  const [leadHighlightIndex, setLeadHighlightIndex] = useState(-1)
  const [payments, setPayments] = useState([])
  const [costs, setCosts] = useState([])
  const [tasks, setTasks] = useState([])

  const apiMode = pipelines.length > 0
  const selectedLead = selectedLeadId ? leads.find((l) => l.id === selectedLeadId) : null
  const selectedPipeline = pipelineId ? pipelines.find((p) => p.id === pipelineId) : null

  const initializedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      initializedRef.current = false
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true

    const hasPrefillLead = !!(prefill?.leadId && leads.some((l) => l.id === prefill.leadId))
    const teamPipe =
      pipelines.find((p) => p.isTeamPipe) ||
      pipelines.find((p) => p.id === prefill?.teamPipelineId)
    const initialPipeline =
      prefill?.pipelineId && pipelines.some((p) => p.id === prefill.pipelineId)
        ? prefill.pipelineId
        : teamPipe?.id || pipelines[0]?.id || ''
    setSelectedLeadId(hasPrefillLead ? prefill.leadId : null)
    setPipelineId(initialPipeline)
    setNotes(prefill?.notes || '')
    setTitle(prefill?.title || '')
    setLeadSearch('')
    setLeadPickerOpen(!hasPrefillLead)
    setLeadHighlightIndex(-1)
    setPayments(mapPrefillFinanceRows(prefill?.payments))
    setCosts(mapPrefillFinanceRows(prefill?.costs))
    setTasks(mapPrefillTaskRows(prefill?.tasks))
  }, [open, prefill, leads, pipelines])

  const filteredLeads = useMemo(() => filterLeads(leads, leadSearch), [leads, leadSearch])

  const selectLead = (lead) => {
    setSelectedLeadId(lead.id)
    setLeadPickerOpen(false)
    setLeadSearch('')
    setLeadHighlightIndex(-1)
  }

  const clearLead = () => {
    setSelectedLeadId(null)
    setLeadPickerOpen(true)
    setLeadSearch('')
    setLeadHighlightIndex(-1)
  }

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    if (!selectedLeadId) return
    if (apiMode && !pipelineId) return
    onSubmit?.({
      title: trimmedTitle,
      notes: notes.trim(),
      leadId: selectedLeadId,
      pipelineId: apiMode ? pipelineId : null,
      payments: financeRowsForSubmit(payments),
      costs: financeRowsForSubmit(costs),
      tasks: taskRowsForSubmit(tasks),
    })
  }

  const canSubmit = !!title.trim() && !!selectedLeadId && (!apiMode || !!pipelineId)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setLeadSearch('')
          setLeadPickerOpen(true)
        }
        onOpenChange(v)
      }}
    >
      <DialogContent
        className="map-panel list-panel create-deal-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer
      >
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b border-white/20 flex-shrink-0 !text-left items-start w-full space-y-0"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <PanelHeader
            onBack={() => onOpenChange(false)}
            title="Create Deal"
            icon={Briefcase}
            subtitle="Add deal details, link a lead, and choose a pipe."
            subtitleClassName="text-sm opacity-60 whitespace-normal"
            titleClassName="text-left justify-start"
            toolbarClassName="w-full"
          />
          <DialogDescription className="sr-only">
            Create a deal with title, notes, lead, and pipeline.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0 px-5 py-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-4 create-list-form">
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">
                Deal name{' '}
                <span className="text-red-400" aria-label="required">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Roof replacement — 912 Linden"
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Scope, next steps, or context for this deal…"
                rows={3}
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15 resize-none min-h-[4.5rem]"
              />
            </div>

            {apiMode && (
              <div>
                <label className="text-xs font-medium block mb-1 opacity-90">
                  Pipeline{' '}
                  <span className="text-red-400" aria-label="required">*</span>
                </label>
                <PipelineDropdown
                  showLabel={false}
                  value={pipelineId}
                  onChange={setPipelineId}
                  pipelines={pipelines}
                  placeholder="Select a pipeline…"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">
                Lead{' '}
                <span className="text-red-400" aria-label="required">*</span>
              </label>

              {selectedLead && !leadPickerOpen ? (
                <SelectedLeadCard lead={selectedLead} onClear={clearLead} />
              ) : (
                <div className="rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden">
                  <div className="relative border-b border-white/10">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                    <input
                      type="search"
                      value={leadSearch}
                      onChange={(e) => {
                        setLeadSearch(e.target.value)
                        setLeadHighlightIndex(-1)
                      }}
                      placeholder="Search by name, address, phone, or email…"
                      className="w-full text-sm pl-9 pr-3 py-2.5 bg-transparent border-0 outline-none"
                      aria-label="Search leads"
                      autoFocus={leadPickerOpen && !selectedLead}
                      onKeyDown={(e) => {
                        if (filteredLeads.length === 0) return
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setLeadHighlightIndex((i) => Math.min(i + 1, filteredLeads.length - 1))
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setLeadHighlightIndex((i) => Math.max(i - 1, -1))
                        } else if (e.key === 'Enter' && leadHighlightIndex >= 0 && filteredLeads[leadHighlightIndex]) {
                          e.preventDefault()
                          selectLead(filteredLeads[leadHighlightIndex])
                        }
                      }}
                    />
                  </div>

                  <ul
                    className="max-h-52 overflow-y-auto scrollbar-hide p-1.5 space-y-1.5"
                    role="listbox"
                    aria-label="Leads"
                  >
                    {filteredLeads.length === 0 ? (
                      <li className="text-sm opacity-50 py-6 px-3 text-center">
                        {leads.length === 0 ? 'No leads yet.' : 'No leads match your search.'}
                      </li>
                    ) : (
                      filteredLeads.map((l, idx) => (
                        <li key={l.id} role="option" aria-selected={leadHighlightIndex === idx}>
                          <button
                            type="button"
                            onClick={() => selectLead(l)}
                            className={cn(
                              leadRowClass,
                              leadHighlightIndex === idx
                                ? 'border-white/40 bg-white/10'
                                : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98]'
                            )}
                          >
                            <div className="text-sm font-medium truncate">{displayLeadName(l)}</div>
                            <div className="text-xs opacity-60 truncate" title={l.address || undefined}>
                              {formatLeadAddress(l) || 'No address'}
                            </div>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>

            <CreateDealFinancesEditor
              payments={payments}
              costs={costs}
              onPaymentsChange={setPayments}
              onCostsChange={setCosts}
            />

            <CreateDealTasksEditor
              tasks={tasks}
              onChange={setTasks}
              dealTitle={title}
              lead={selectedLead}
              pipeline={selectedPipeline}
              teams={teams}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 flex-shrink-0 border-t border-white/10 mt-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Deal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateDealDialog
