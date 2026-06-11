import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Plus, Eye, Trash2, MoreVertical, FileDown, Share2, Pencil, Tag, List, Search } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { Input } from './ui/input'
import { LeadSharingIcon } from './ResourceSharePicker'
import { ShareResourceDialog } from './ShareResourceDialog'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'
import { filterByTags } from '@/utils/tags'
import { updateList } from '@/utils/lists'
import { PanelFilterMenu } from './tags/PanelFilterMenu'
import { EntityTagPills } from './tags/EntityTagPills'
import { TagPicker } from './tags/TagPicker'
import { CreateListDialog } from './CreateListDialog'
import { ignoreRadixMapPanelDismiss } from './ui/panelDialogUtils'

const LIST_HIGHLIGHT_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626',
  '#0d9488', '#db2777', '#4f46e5', '#d97706', '#65a30d',
  '#0891b2', '#e11d48', '#7c3aed', '#059669', '#0284c7',
  '#c026d3', '#b45309', '#1d4ed8', '#15803d', '#be185d',
]
const MAX_HIGHLIGHTED_LISTS = 20
const MENU_WIDTH = 180

const LIST_TABS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'shared', label: 'Shared' },
  { id: 'highlighted', label: 'On map' },
]

function filterListsByTab(lists, tab, ownerId, highlightedIds) {
  switch (tab) {
    case 'mine':
      return lists.filter((l) => l.ownerId === ownerId)
    case 'shared':
      return lists.filter((l) => l.ownerId !== ownerId)
    case 'highlighted':
      return lists.filter((l) => highlightedIds.includes(l.id))
    default:
      return lists
  }
}

export function ListPanel({ 
  currentUser,
  isOpen,
  panelDockSlot,
  onClose,
  onBack,
  selectedListIds = [],
  onToggleListHighlight,
  onAddParcelsToList,
  selectedParcelsCount,
  lists = [],
  onListsChange,
  onListPatch,
  onDeleteList,
  onRenameList,
  onShareList,
  onShareListWithTeams,
  teams = [],
  teamMembership = null,
  onValidateShareEmail,
  onViewListContents,
  onExportList,
  isAddingSingleParcel = false,
  isBulkEmailMode = false,
  /** Matches Settings → Parcel boundary color (list add / multi-select prompts). */
  parcelBoundaryColor = '#2563eb',
  getToken,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
}) {
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [tagEditListId, setTagEditListId] = useState(null)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [tagPickerAnchorPosition, setTagPickerAnchorPosition] = useState(null)
  const tagPickerAnchorRef = useRef(null)
  const tagPickerPortalRef = useRef(null)
  const parcelPromptBannerStyle =
    typeof parcelBoundaryColor === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(parcelBoundaryColor)
      ? {
          color: 'white',
          borderColor: parcelBoundaryColor,
          backgroundColor: `${parcelBoundaryColor}22`,
        }
      : { color: 'white', borderColor: parcelBoundaryColor }

  const isHex6 = typeof parcelBoundaryColor === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(parcelBoundaryColor)
  const addParcelsBtnHoverEnter = (e) => {
    if (isHex6) e.currentTarget.style.backgroundColor = `${parcelBoundaryColor}33`
    else e.currentTarget.style.backgroundColor = 'rgba(37, 99, 234, 0.2)'
  }
  const addParcelsBtnHoverLeave = (e) => {
    e.currentTarget.style.backgroundColor = 'transparent'
  }
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const menuTriggerRef = useRef(null)
  const [renamingListId, setRenamingListId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)
  const [shareListId, setShareListId] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareEmailValid, setShareEmailValid] = useState(null)
  const [shareEmailError, setShareEmailError] = useState('')
  const [isValidatingShare, setIsValidatingShare] = useState(false)
  const validateTimeoutRef = useRef(null)
  /** Optimistic team picks in Share dialog; avoids waiting for server to show checkmarks */
  const [localShareState, setLocalShareState] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setTab('all')
      setSearch('')
      setOpenMenuId(null)
      setRenamingListId(null)
      setRenameValue('')
      setShareListId(null)
      setLocalShareState(null)
      setShareEmail('')
      setShareEmailValid(null)
      setShareEmailError('')
      setIsValidatingShare(false)
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current)
        validateTimeoutRef.current = null
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (renamingListId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingListId])

  const runValidation = useCallback(async (email) => {
    const trimmed = (email || '').trim().toLowerCase()
    if (!trimmed) {
      setShareEmailValid(null)
      setShareEmailError('')
      return
    }
    if (!onValidateShareEmail) {
      setShareEmailValid(true)
      setShareEmailError('')
      return
    }
    setIsValidatingShare(true)
    setShareEmailError('')
    try {
      const { valid } = await onValidateShareEmail(trimmed)
      setShareEmailValid(valid)
      setShareEmailError(valid ? '' : 'No user found with this email')
    } catch {
      setShareEmailValid(false)
      setShareEmailError('Could not validate email')
    } finally {
      setIsValidatingShare(false)
    }
  }, [onValidateShareEmail])

  useEffect(() => {
    if (!shareListId) return
    const trimmed = (shareEmail || '').trim().toLowerCase()
    if (!trimmed) {
      setShareEmailValid(null)
      setShareEmailError('')
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current)
        validateTimeoutRef.current = null
      }
      return
    }
    if (validateTimeoutRef.current) clearTimeout(validateTimeoutRef.current)
    validateTimeoutRef.current = setTimeout(() => {
      validateTimeoutRef.current = null
      runValidation(shareEmail)
    }, 400)
    return () => {
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current)
      }
    }
  }, [shareListId, shareEmail, runValidation])

  const MENU_PADDING = 8

  const openMenu = (listId, event) => {
    event.stopPropagation()
    tagPickerAnchorRef.current = event.currentTarget
    menuTriggerRef.current = event.currentTarget
    setOpenMenuId(listId)
  }

  useEffect(() => {
    if (isOpen && onListsChange) onListsChange()
  }, [isOpen, onListsChange])

  const handleRenameSubmit = async (listId) => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      setRenamingListId(null)
      setRenameValue('')
      return
    }
    const list = allLists.find(l => l.id === listId)
    if (list && trimmed === list.name) {
      setRenamingListId(null)
      setRenameValue('')
      return
    }
    if (onRenameList) {
      await onRenameList(listId, trimmed)
    }
    setRenamingListId(null)
    setRenameValue('')
  }

  const handleDeleteListClick = (list) => {
    if (onDeleteList) onDeleteList(list)
  }

  const handleShareSave = async () => {
    if (!shareListId || !onShareList) return
    const email = shareEmail.trim().toLowerCase()
    if (!email) {
      showToast('Please enter an email', 'error')
      return
    }
    if (shareEmailValid === false) {
      showToast('No user found with this email', 'error')
      return
    }
    if (shareEmailValid !== true && onValidateShareEmail) {
      showToast('Please wait for email validation', 'error')
      return
    }
    const list = allLists.find((l) => l.id === shareListId)
    const current = list?.sharedWith || []
    if (current.some((e) => (e || '').toLowerCase() === email)) {
      showToast('This email is already in the share list', 'error')
      return
    }
    try {
      await onShareList(shareListId, [...current, email])
      setShareEmail('')
      setShareEmailValid(null)
      setShareEmailError('')
    } catch {
      /* App shows error toast */
    }
  }

  const handleRemoveSharedEmail = async (emailToRemove) => {
    if (!shareListId || !onShareList) return
    const list = allLists.find((l) => l.id === shareListId)
    const current = list?.sharedWith || []
    const updated = current.filter((e) => (e || '').toLowerCase() !== (emailToRemove || '').toLowerCase())
    try {
      await onShareList(shareListId, updated)
    } catch {
      /* App shows error toast */
    }
  }

  const allLists = lists || []
  const ownerId = currentUser?.uid

  const tabCounts = useMemo(() => ({
    all: allLists.length,
    mine: allLists.filter((l) => l.ownerId === ownerId).length,
    shared: allLists.filter((l) => l.ownerId !== ownerId).length,
    highlighted: allLists.filter((l) => selectedListIds.includes(l.id)).length,
  }), [allLists, ownerId, selectedListIds])

  const filteredLists = useMemo(() => {
    let result = filterListsByTab(allLists, tab, ownerId, selectedListIds)
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((l) => (l.name || '').toLowerCase().includes(q))
    }
    return filterByTags(result, selectedTagIds)
  }, [allLists, tab, ownerId, selectedListIds, search, selectedTagIds])

  const isListOwnedByUser = (list) => list?.ownerId === ownerId
  const openMenuList = openMenuId ? allLists.find((l) => l.id === openMenuId) : null

  const handleListTagsChange = useCallback(async (listId, { tagIds, tagMeta }) => {
    if (!getToken) return
    const previous = allLists.find((l) => l.id === listId)
    onListPatch?.(listId, { tagIds, tagMeta })
    try {
      const saved = await updateList(getToken, listId, { tagIds, tagMeta })
      onListPatch?.(listId, { tagIds: saved.tagIds, tagMeta: saved.tagMeta })
      return saved
    } catch (e) {
      if (previous) {
        onListPatch?.(listId, { tagIds: previous.tagIds, tagMeta: previous.tagMeta })
      }
      showToast(e.message || 'Could not update tags', 'error')
      throw e
    }
  }, [getToken, allLists, onListPatch])

  useEffect(() => {
    if (!shareListId) {
      setLocalShareState(null)
      return
    }
    const list = allLists.find((l) => l.id === shareListId)
    const norm = normalizeResourceVisibility(list || {})
    setLocalShareState({
      visibility: norm.visibility || VISIBILITY.PRIVATE,
      sharedMemberUids: norm.sharedMemberUids || [],
    })
  }, [shareListId])

  const handleShareChange = useCallback(
    (next) => {
      if (!onShareListWithTeams || !shareListId) return
      setLocalShareState(next)
      void (async () => {
        try {
          await onShareListWithTeams(shareListId, next)
        } catch (e) {
          const list = allLists.find((l) => l.id === shareListId)
          const norm = normalizeResourceVisibility(list || {})
          setLocalShareState({
            visibility: norm.visibility || VISIBILITY.PRIVATE,
            sharedMemberUids: norm.sharedMemberUids || [],
          })
          showToast(e.message || 'Failed to update sharing', 'error')
        }
      })()
    },
    [onShareListWithTeams, shareListId, allLists]
  )

  const handleToggleHighlight = (listId) => {
    if (!onToggleListHighlight) return
    if (selectedListIds.includes(listId)) {
      onToggleListHighlight(listId)
    } else if (selectedListIds.length >= MAX_HIGHLIGHTED_LISTS) {
      showToast(`Maximum ${MAX_HIGHLIGHTED_LISTS} lists can be highlighted. Remove one to add another.`, 'warning')
    } else {
      onToggleListHighlight(listId)
    }
  }

  const handlePanelBack = () => {
    onBack?.() ?? onClose?.()
  }

  return (
    <>
    <Dialog open={isOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
      <DialogContent
        className="map-panel list-panel lists-panel fullscreen-panel flex flex-col min-h-0 p-0"
        panelDockSlot={panelDockSlot}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop
        onInteractOutside={(e) => {
          if (e.target.closest?.('[data-list-panel-menu]')) e.preventDefault()
          if (e.target.closest?.('[data-tag-picker-menu]')) e.preventDefault()
          if (e.target.closest?.('[data-tag-picker-trigger]')) e.preventDefault()
          if (e.target.closest?.('[data-panel-filter-menu]')) e.preventDefault()
        }}
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">Manage your property lists, add parcels, and share lists</DialogDescription>
          <PanelHeader onBack={handlePanelBack} title="Lists">
            {allLists.length > 0 && (
              <PanelFilterMenu
                tags={tagRegistry.lists || []}
                selectedTagIds={selectedTagIds}
                onTagIdsChange={setSelectedTagIds}
              />
            )}
            <PanelCreateButton
              onClick={() => setShowCreateDialog(true)}
              title="Create new list"
              iconColor={parcelBoundaryColor}
            />
          </PanelHeader>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-6 py-3 space-y-1.5"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {isAddingSingleParcel && (
            <div className="mb-3 p-3 rounded-lg text-sm font-medium text-center border" style={parcelPromptBannerStyle}>
              Select a list to add this parcel to
            </div>
          )}
          {!isAddingSingleParcel && selectedParcelsCount > 0 && (
            <div className="mb-3 p-3 rounded-lg text-sm font-medium text-center border" style={parcelPromptBannerStyle}>
              {selectedParcelsCount} parcel{selectedParcelsCount !== 1 ? 's' : ''} selected
            </div>
          )}
          {!isAddingSingleParcel && selectedParcelsCount === 0 && isBulkEmailMode && (
            <div className="mb-3 p-3 rounded-lg text-sm font-medium text-center border" style={{ color: 'white', borderColor: '#16a34a' }}>
              Select a list to send emails to
            </div>
          )}

          <div className="mb-3 space-y-2">
            <div className="hidden md:flex gap-4 flex-wrap" role="tablist" aria-label="List filters">
              {LIST_TABS.map(({ id, label }) => {
                const isActive = tab === id
                const count = tabCounts[id] ?? 0
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setTab(id)}
                    className={cn(
                      'pb-1.5 text-sm font-medium border-b-2 transition-opacity',
                      isActive ? 'opacity-100 border-white/70' : 'opacity-50 border-transparent hover:opacity-80'
                    )}
                  >
                    {label}
                    <span className="text-xs opacity-60 ml-1">{count}</span>
                  </button>
                )
              })}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lists by name…"
                className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                aria-label="Search lists"
              />
            </div>
          </div>

          {allLists.length === 0 ? (
            <div className="text-center py-16">
              <List className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm opacity-60">No lists yet.</p>
              <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Create a list to save parcels from the map and organize your properties.</p>
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm opacity-60">
                {search.trim() || selectedTagIds.length > 0
                  ? 'No lists match your filters.'
                  : `No ${tab === 'all' ? '' : `${LIST_TABS.find((t) => t.id === tab)?.label?.toLowerCase() || tab} `}lists yet.`}
              </p>
            </div>
          ) : (
            filteredLists.map((list) => {
              const isSelected = selectedListIds.includes(list.id)
              const listColorIndex = isSelected ? selectedListIds.indexOf(list.id) : -1
              const listColor = listColorIndex >= 0 ? LIST_HIGHLIGHT_COLORS[listColorIndex] : undefined
              const parcelCount = list.parcels?.length ?? 0
              const rowDisabled = !isAddingSingleParcel && !isBulkEmailMode && parcelCount === 0

              return (
                <div
                  key={list.id}
                  role="button"
                  tabIndex={rowDisabled ? -1 : 0}
                  className={cn(
                    'w-full text-left map-panel-list-item leads-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10 cursor-pointer',
                    isSelected && 'border-solid bg-white/[0.08]',
                    rowDisabled && 'cursor-not-allowed opacity-75'
                  )}
                  style={isSelected ? {
                    borderColor: listColor ?? LIST_HIGHLIGHT_COLORS[0],
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  } : undefined}
                  onClick={() => {
                    if (isAddingSingleParcel || isBulkEmailMode) {
                      onAddParcelsToList?.(list.id)
                      return
                    }
                    if (parcelCount > 0 && onViewListContents) onViewListContents(list.id)
                  }}
                  onKeyDown={(e) => {
                    if (rowDisabled) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (isAddingSingleParcel || isBulkEmailMode) onAddParcelsToList?.(list.id)
                      else if (parcelCount > 0) onViewListContents?.(list.id)
                    }
                  }}
                  title={
                    isAddingSingleParcel
                      ? 'Click to add parcel to this list'
                      : isBulkEmailMode
                        ? 'Click to send emails to this list'
                        : parcelCount > 0
                          ? 'Click to view list contents'
                          : 'List is empty'
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {isSelected && !isAddingSingleParcel && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: listColor ?? LIST_HIGHLIGHT_COLORS[0] }}
                          title={`Color ${listColorIndex + 1}`}
                        />
                      )}
                      {renamingListId === list.id ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit(list.id)
                            if (e.key === 'Escape') { setRenamingListId(null); setRenameValue('') }
                          }}
                          onBlur={() => handleRenameSubmit(list.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-sm bg-transparent border-b border-blue-500 outline-none w-full min-w-0 py-0.5"
                        />
                      ) : (
                        <span className="font-medium truncate">{list.name}</span>
                      )}
                      <LeadSharingIcon resource={list} collaboratorHint={!isListOwnedByUser(list)} />
                    </div>
                    <p className="text-sm opacity-70 truncate">
                      {parcelCount} parcel{parcelCount !== 1 ? 's' : ''}
                    </p>
                    <EntityTagPills
                      entity={list}
                      tagRegistry={tagRegistry}
                      type="lists"
                      className="mt-0.5"
                    />
                  </div>
                  {selectedParcelsCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddParcelsToList?.(list.id)
                      }}
                      onMouseEnter={addParcelsBtnHoverEnter}
                      onMouseLeave={addParcelsBtnHoverLeave}
                      className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors"
                      style={{ color: parcelBoundaryColor }}
                      title="Add selected parcels to this list"
                    >
                      <Plus className="h-5 w-5" strokeWidth={2.5} color={parcelBoundaryColor} />
                    </button>
                  )}
                  {!isAddingSingleParcel && (
                    <>
                      <button
                        type="button"
                        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleHighlight(list.id)
                        }}
                        title={isSelected ? 'Remove highlight' : 'Highlight on map'}
                        aria-pressed={isSelected}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10"
                        onClick={(e) => openMenu(list.id, e)}
                        aria-label={`Options for ${list.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
        <div ref={tagPickerPortalRef} className="contents" aria-hidden />
      </DialogContent>

      <OptionsMenuDropdown
        open={!!openMenuList}
        onClose={() => setOpenMenuId(null)}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
        dataAttr="data-list-panel-menu"
      >
        {openMenuList && (
          <>
            {onExportList && (
              <OptionsMenuItem onClick={() => { setOpenMenuId(null); onExportList(openMenuList.id) }}>
                <FileDown className="h-4 w-4" />
                Export list
              </OptionsMenuItem>
            )}
            {onShareList && isListOwnedByUser(openMenuList) && (
              <OptionsMenuItem onClick={() => { setOpenMenuId(null); setShareListId(openMenuList.id); setShareEmail('') }}>
                <Share2 className="h-4 w-4" />
                Share list
              </OptionsMenuItem>
            )}
            {onRenameList && isListOwnedByUser(openMenuList) && (
              <OptionsMenuItem onClick={() => {
                setOpenMenuId(null)
                setRenameValue(openMenuList.name)
                setRenamingListId(openMenuList.id)
              }}>
                <Pencil className="h-4 w-4" />
                Rename list
              </OptionsMenuItem>
            )}
            {getToken && isListOwnedByUser(openMenuList) && (
              <OptionsMenuItem onClick={() => {
                const el = tagPickerAnchorRef.current
                if (el) {
                  const rect = el.getBoundingClientRect()
                  setTagPickerAnchorPosition({
                    top: rect.bottom + 4,
                    left: Math.max(MENU_PADDING, rect.right - 220),
                    minWidth: 220,
                  })
                } else {
                  setTagPickerAnchorPosition({ top: 80, left: 24, minWidth: 220 })
                }
                setTagEditListId(openMenuList.id)
                setOpenMenuId(null)
                requestAnimationFrame(() => setTagPickerOpen(true))
              }}>
                <Tag className="h-4 w-4" />
                Tags
              </OptionsMenuItem>
            )}
            {isListOwnedByUser(openMenuList) && (
              <OptionsMenuItem destructive onClick={() => { setOpenMenuId(null); handleDeleteListClick(openMenuList) }}>
                <Trash2 className="h-4 w-4" />
                Delete list
              </OptionsMenuItem>
            )}
          </>
        )}
      </OptionsMenuDropdown>
    </Dialog>

    <CreateListDialog
      open={showCreateDialog}
      onOpenChange={setShowCreateDialog}
      getToken={getToken}
      onCreated={() => onListsChange?.()}
      teams={teams}
      teamMembership={teamMembership}
      tagRegistry={tagRegistry}
      onRefreshTags={onRefreshTags}
      nestedOverlay
    />

    {shareListId && (() => {
      const list = allLists.find((l) => l.id === shareListId)
      const shareState = localShareState ?? { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }
      const activeTeam = teams?.[0] || null
      const allowExternalSharing = teamMembership?.allowExternalSharing === true
      const closeShareList = () => {
        setShareListId(null)
        setShareEmail('')
        setShareEmailValid(null)
        setShareEmailError('')
      }
      return (
        <ShareResourceDialog
          open={!!shareListId}
          onOpenChange={(open) => { if (!open) closeShareList() }}
          title="Share list"
          team={activeTeam}
          showTeamPicker={Boolean(onShareListWithTeams && activeTeam)}
          shareState={shareState}
          onShareStateChange={handleShareChange}
          allowExternalSharing={allowExternalSharing}
          sharedWithEmails={list?.sharedWith || []}
          onRemoveSharedEmail={handleRemoveSharedEmail}
          shareEmail={shareEmail}
          onShareEmailChange={setShareEmail}
          shareEmailValid={shareEmailValid}
          shareEmailError={shareEmailError}
          isValidatingShare={isValidatingShare}
          onShareEmailSave={handleShareSave}
        />
      )
    })()}

    {tagEditListId && tagPickerOpen && (
      <TagPicker
        type="lists"
        entity={allLists.find((l) => l.id === tagEditListId)}
        tagRegistry={tagRegistry}
        getToken={getToken}
        onRegistryChange={onRefreshTags}
        hideWhenEmpty={false}
        open={tagPickerOpen}
        onOpenChange={(open) => {
          setTagPickerOpen(open)
          if (!open) {
            setTagEditListId(null)
            setTagPickerAnchorPosition(null)
          }
        }}
        anchorPosition={tagPickerAnchorPosition}
        portalContainerRef={tagPickerPortalRef}
        onTagsChange={(tags) => handleListTagsChange(tagEditListId, tags)}
      />
    )}
    </>
  )
}

