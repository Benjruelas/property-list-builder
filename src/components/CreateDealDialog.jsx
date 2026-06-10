import { useMemo, useState, useEffect, useRef } from 'react'
import { Briefcase, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { PanelHeader } from './ui/panel-header'
import { PipelineDropdown } from './PipelineDropdown'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { LeadPickerField } from './pickers/LeadPickerField'
import { CreateDealFinancesEditor, mapPrefillFinanceRows, financeRowsForSubmit } from './CreateDealFinancesEditor'
import { CreateDealTasksEditor, mapPrefillTaskRows, taskRowsForSubmit } from './CreateDealTasksEditor'

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
  canSeeDealAmounts = true,
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [pipelineId, setPipelineId] = useState('')
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
    setPayments(mapPrefillFinanceRows(prefill?.payments))
    setCosts(mapPrefillFinanceRows(prefill?.costs))
    setTasks(mapPrefillTaskRows(prefill?.tasks))
  }, [open, prefill, leads, pipelines])

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
      modal={false}
      onOpenChange={(v) => {
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

            <LeadPickerField
              label="Lead"
              required
              leads={leads}
              value={selectedLeadId}
              onChange={(lead) => setSelectedLeadId(lead?.id || null)}
            />

            <CreateDealFinancesEditor
              payments={payments}
              costs={costs}
              onPaymentsChange={setPayments}
              onCostsChange={setCosts}
              canSeeDealAmounts={canSeeDealAmounts}
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
