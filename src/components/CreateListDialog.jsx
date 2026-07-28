import { useState, useEffect } from 'react'
import { Loader2, ListPlus } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ResourceSharePicker } from './ResourceSharePicker'
import { TagPicker } from './tags/TagPicker'
import { VISIBILITY } from '@/utils/access'
import { createList } from '@/utils/lists'
import { showToast } from './ui/toast'

export function CreateListDialog({
  open,
  onOpenChange,
  getToken,
  onCreated,
  teams = [],
  teamMembership = null,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
  nestedOverlay = false,
  topLayer = false,
}) {
  const activeTeam = teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true
  const [name, setName] = useState('')
  const [shareState, setShareState] = useState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
  const [draftTags, setDraftTags] = useState({ tagIds: [], tagMeta: [] })
  const [tagsPickerOpen, setTagsPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setShareState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
      setDraftTags({ tagIds: [], tagMeta: [] })
      setTagsPickerOpen(false)
    }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('List name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: trimmed,
        tagIds: draftTags.tagIds,
        tagMeta: draftTags.tagMeta,
        visibility: shareState.visibility,
        sharedMemberUids: shareState.sharedMemberUids,
        teamId: activeTeam?.id || null,
      }
      const list = await createList(getToken, payload)
      showToast('List created', 'success')
      onCreated?.(list)
      onOpenChange(false)
    } catch (err) {
      showToast(err.message || 'Could not create list', 'error')
    } finally {
      setSaving(false)
    }
  }

  const draftEntity = { tagIds: draftTags.tagIds, tagMeta: draftTags.tagMeta }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel list-panel create-list-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
      >
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b border-white/20 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <PanelHeader
            onBack={() => onOpenChange(false)}
            title="Create List"
            icon={ListPlus}
          />
          <DialogDescription className="sr-only">
            Create a new property list with optional sharing and tags
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-4 space-y-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div>
              <label className="text-xs opacity-60 mb-1 block">List Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoFocus
                placeholder="e.g. North Dallas prospects"
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
              <label className="text-xs opacity-60 mb-1 block">Tags</label>
              <TagPicker
                type="lists"
                entity={draftEntity}
                tagRegistry={tagRegistry}
                getToken={getToken}
                onRegistryChange={onRefreshTags}
                disabled={saving}
                hideWhenEmpty={false}
                showAddTrigger
                inline
                open={tagsPickerOpen}
                onOpenChange={setTagsPickerOpen}
                onTagsChange={({ tagIds, tagMeta }) => setDraftTags({ tagIds, tagMeta })}
              />
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create List'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateListDialog
