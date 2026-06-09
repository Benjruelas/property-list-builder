import { useState, useEffect } from 'react'
import { Loader2, GitBranch, Plus, Trash2 } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ResourceSharePicker } from './ResourceSharePicker'
import { VISIBILITY } from '@/utils/access'
import { createPipeline } from '@/utils/pipelines'
import { createDefaultPipelineColumns } from '@/utils/dealPipeline'
import { showToast } from './ui/toast'

const MAX_STAGES = 10

export function CreatePipelineDialog({
  open,
  onOpenChange,
  getToken,
  onCreated,
  onPipelinesChange,
  onActivePipelineChange,
  teams = [],
  teamMembership = null,
  nestedOverlay = true,
  topLayer = true,
}) {
  const activeTeam = teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true
  const [name, setName] = useState('')
  const [shareState, setShareState] = useState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
  const [stages, setStages] = useState(() => createDefaultPipelineColumns())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setShareState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
      setStages(createDefaultPipelineColumns())
    }
  }, [open])

  const updateStageName = (id, nextName) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name: nextName } : s)))
  }

  const removeStage = (id) => {
    if (stages.length <= 1) return
    setStages((prev) => prev.filter((s) => s.id !== id))
  }

  const addStage = () => {
    if (stages.length >= MAX_STAGES) return
    setStages((prev) => [...prev, { id: `col-${Date.now()}`, name: '' }])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('Pipeline name is required', 'error')
      return
    }
    const normalizedStages = stages
      .map((s) => ({ ...s, name: (s.name || '').trim() }))
      .filter((s) => s.name)
    if (normalizedStages.length === 0) {
      showToast('Add at least one stage', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: trimmed,
        columns: normalizedStages,
        visibility: shareState.visibility,
        sharedMemberUids: shareState.sharedMemberUids,
        teamId: activeTeam?.id || null,
        teamShares: shareState.visibility === VISIBILITY.TEAM && activeTeam ? [activeTeam.id] : [],
      }
      const created = await createPipeline(getToken, payload)
      await onPipelinesChange?.()
      onActivePipelineChange?.(created.id)
      onCreated?.(created)
      showToast('Pipeline created', 'success')
      onOpenChange(false)
    } catch (err) {
      showToast(err.message || 'Could not create pipeline', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel list-panel create-pipeline-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
        data-create-pipeline-dialog
      >
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b border-white/20 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <PanelHeader
            onBack={() => onOpenChange(false)}
            title="Create Pipeline"
            icon={GitBranch}
          />
          <DialogDescription className="sr-only">
            Create a new deal pipeline with sharing and stages
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div>
              <label className="text-xs opacity-60 mb-1 block">Pipeline name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoFocus
                placeholder="e.g. Residential claims"
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
              />
            </div>

            {activeTeam && (
              <ResourceSharePicker
                team={activeTeam}
                visibility={shareState.visibility}
                sharedMemberUids={shareState.sharedMemberUids}
                onChange={setShareState}
                disabled={saving}
                allowExternalSharing={allowExternalSharing}
                collapsible
              />
            )}

            <div>
              <label className="text-xs opacity-60 mb-1 block">Stages</label>
              <p className="text-xs opacity-45 mb-2">
                Default stages are included — rename, remove, or add more.
              </p>
              <ul className="space-y-2">
                {stages.map((stage, index) => (
                  <li key={stage.id} className="flex items-center gap-2">
                    <span className="text-xs opacity-40 w-5 flex-shrink-0 text-right tabular-nums">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={stage.name}
                      onChange={(e) => updateStageName(stage.id, e.target.value)}
                      disabled={saving}
                      placeholder="Stage name"
                      className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
                    />
                    <button
                      type="button"
                      onClick={() => removeStage(stage.id)}
                      disabled={saving || stages.length <= 1}
                      className="p-2 rounded-lg opacity-60 hover:opacity-100 disabled:opacity-30"
                      aria-label={`Remove stage ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {stages.length < MAX_STAGES && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={addStage}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4" />
                  Add stage
                </Button>
              )}
            </div>
          </div>

          <div
            className="flex justify-end gap-2 px-5 py-4 border-t border-white/20 flex-shrink-0"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Pipeline'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreatePipelineDialog
