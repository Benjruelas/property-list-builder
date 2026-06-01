import { useEffect, useRef, useState } from 'react'
import { Briefcase, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { PipelineDropdown } from './PipelineDropdown'
import { CreateDealFinancesEditor, mapPrefillFinanceRows, financeRowsForSubmit } from './CreateDealFinancesEditor'
import { CreateDealTasksEditor, mapPrefillTaskRows, taskRowsForSubmit } from './CreateDealTasksEditor'
import { addDealTemplate, updateDealTemplate, getDealTemplateById } from '@/utils/dealTemplates'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import {
  DealTemplatePanelShell,
  DealTemplatePanelFormFooter,
} from './dealTemplates/dealTemplatePanelShared'

export function DealTemplateEditorDialog({
  open,
  onOpenChange,
  templateId = null,
  pipelines = [],
  teams = [],
  onSaved,
  nestedOverlay = true,
}) {
  const { scheduleSync } = useUserDataSync()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [payments, setPayments] = useState([])
  const [costs, setCosts] = useState([])
  const [tasks, setTasks] = useState([])
  const [saving, setSaving] = useState(false)

  const apiMode = pipelines.length > 0
  const selectedPipeline = pipelineId ? pipelines.find((p) => p.id === pipelineId) : null
  const isEdit = !!templateId
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      initializedRef.current = false
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true

    const existing = templateId ? getDealTemplateById(templateId) : null
    setName(existing?.name || '')
    setTitle(existing?.title || '')
    setNotes(existing?.notes || '')
    const initialPipeline =
      existing?.pipelineId && pipelines.some((p) => p.id === existing.pipelineId)
        ? existing.pipelineId
        : pipelines[0]?.id || ''
    setPipelineId(initialPipeline)
    setPayments(mapPrefillFinanceRows(existing?.payments))
    setCosts(mapPrefillFinanceRows(existing?.costs))
    setTasks(mapPrefillTaskRows(existing?.tasks))
  }, [open, templateId, pipelines])

  const canSubmit = !!name.trim()

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        title: title.trim(),
        notes: notes.trim(),
        pipelineId: apiMode && pipelineId ? pipelineId : null,
        payments: financeRowsForSubmit(payments),
        costs: financeRowsForSubmit(costs),
        tasks: taskRowsForSubmit(tasks),
      }
      if (isEdit) {
        updateDealTemplate(templateId, payload)
        showToast('Template updated', 'success')
      } else {
        addDealTemplate(payload)
        showToast('Template created', 'success')
      }
      scheduleSync()
      onSaved?.()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DealTemplatePanelShell
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit deal template' : 'Create deal template'}
      icon={Briefcase}
      subtitle="Defaults for new deals — lead is chosen when creating a deal."
      description={isEdit ? 'Edit deal template' : 'Create deal template'}
      nestedOverlay={nestedOverlay}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 px-5 py-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-4 create-list-form">
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">
                Template name{' '}
                <span className="text-red-400" aria-label="required">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard roof job"
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">Default deal name</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Roof replacement — 912 Linden"
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
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
                <label className="text-xs font-medium block mb-1 opacity-90">Default pipeline</label>
                <PipelineDropdown
                  showLabel={false}
                  value={pipelineId}
                  onChange={setPipelineId}
                  pipelines={pipelines}
                  placeholder="Select a pipeline…"
                />
              </div>
            )}

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
              lead={null}
              pipeline={selectedPipeline}
              teams={teams}
            />
          </div>

          <DealTemplatePanelFormFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? 'Save template' : 'Create template'}
            </Button>
          </DealTemplatePanelFormFooter>
      </form>
    </DealTemplatePanelShell>
  )
}

export default DealTemplateEditorDialog
