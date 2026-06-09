import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Eye, Trash2, Check, MoreVertical, FileDown, Share2, Users, Pencil, Tag } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { Input } from './ui/input'
import { VisibilityBadge } from './ResourceSharePicker'
import { ShareResourceDialog } from './ShareResourceDialog'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'
import { filterByTags } from '@/utils/tags'
import { updateList } from '@/utils/lists'
import { PanelFilterMenu } from './tags/PanelFilterMenu'
import { EntityTagPills } from './tags/EntityTagPills'
import { TagPicker } from './tags/TagPicker'
import { CreateListDialog } from './CreateListDialog'

const LIST_HIGHLIGHT_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626',
  '#0d9488', '#db2777', '#4f46e5', '#d97706', '#65a30d',
  '#0891b2', '#e11d48', '#7c3aed', '#059669', '#0284c7',
  '#c026d3', '#b45309', '#1d4ed8', '#15803d', '#be185d',
]
const MAX_HIGHLIGHTED_LISTS = 20

export function ListPanel({ 
  currentUser,
  isOpen, 
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
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [openDropdownListId, setOpenDropdownListId] = useState(null)
  const [dropdownAnchor, setDropdownAnchor] = useState(null)
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
      setOpenDropdownListId(null)
      setDropdownAnchor(null)
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

  const MENU_WIDTH = 180
  const MENU_PADDING = 8
  const openDropdown = (listId, event) => {
    event.stopPropagation()
    const el = event.currentTarget
    tagPickerAnchorRef.current = el
    const rect = el.getBoundingClientRect()
    let top = rect.bottom + 4
    let left = rect.right - MENU_WIDTH
    if (left < MENU_PADDING) left = MENU_PADDING
    if (left + MENU_WIDTH > window.innerWidth - MENU_PADDING) left = window.innerWidth - MENU_WIDTH - MENU_PADDING
    const menuHeight = 320
    if (top + menuHeight > window.innerHeight - MENU_PADDING) top = Math.max(MENU_PADDING, rect.top - menuHeight - 4)
    setDropdownAnchor({ top, left })
    setOpenDropdownListId(listId)
  }

  const closeDropdown = () => {
    setOpenDropdownListId(null)
    setDropdownAnchor(null)
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
  const filteredLists = useMemo(
    () => filterByTags(allLists, selectedTagIds),
    [allLists, selectedTagIds]
  )
  const isListOwnedByUser = (list) => list?.ownerId === currentUser?.uid

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
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        handlePanelBack()
      }
    }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel"
        showCloseButton={false}
        hideOverlay
        onInteractOutside={(e) => {
          if (e.target.closest?.('[data-list-panel-dropdown]')) e.preventDefault()
          if (e.target.closest?.('[data-tag-picker-menu]')) e.preventDefault()
          if (e.target.closest?.('[data-tag-picker-trigger]')) e.preventDefault()
          if (e.target.closest?.('[data-panel-filter-menu]')) e.preventDefault()
        }}
      >
        <DialogHeader className={PANEL_LIST_HEADER_CLASS} style={PANEL_LIST_HEADER_STYLE}>
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

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {isAddingSingleParcel && (
            <div className="mb-4 p-3 rounded-lg text-sm font-medium text-center border" style={parcelPromptBannerStyle}>
              Select a list to add this parcel to
            </div>
          )}
          {!isAddingSingleParcel && selectedParcelsCount > 0 && (
            <div className="mb-4 p-3 rounded-lg text-sm font-medium text-center border" style={parcelPromptBannerStyle}>
              {selectedParcelsCount} parcel{selectedParcelsCount !== 1 ? 's' : ''} selected
            </div>
          )}
          {!isAddingSingleParcel && selectedParcelsCount === 0 && isBulkEmailMode && (
            <div className="mb-4 p-3 rounded-lg text-sm font-medium text-center border" style={{ color: 'white', borderColor: '#16a34a' }}>
              Select a list to send emails to
            </div>
          )}
          <div className="space-y-4">
            {allLists.length === 0 ? (
              <p className="text-center text-gray-500 py-8 text-sm">No lists yet. Create one to get started!</p>
            ) : filteredLists.length === 0 ? (
              <p className="text-center text-gray-500 py-8 text-sm">No lists match the selected tags.</p>
            ) : (
              <div className="space-y-2">
                {filteredLists.map(list => {
                      const isSelected = selectedListIds.includes(list.id)
                      const listColorIndex = isSelected ? selectedListIds.indexOf(list.id) : -1
                      const listColor = listColorIndex >= 0 ? LIST_HIGHLIGHT_COLORS[listColorIndex] : undefined
                      return (
                      <div 
                        key={list.id} 
                        className={cn(
                          "map-panel-list-item flex items-center justify-between p-3 rounded-lg transition-all",
                          isSelected
                            ? "border border-solid bg-white/[0.08]"
                            : "border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
                          !isAddingSingleParcel && !isBulkEmailMode && (list.parcels?.length ?? 0) === 0
                            ? "cursor-not-allowed opacity-75"
                            : "cursor-pointer"
                        )}
                        style={isSelected ? {
                          borderColor: listColor ?? LIST_HIGHLIGHT_COLORS[0],
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        } : undefined}
                        onClick={(e) => {
                          if (isAddingSingleParcel) {
                            onAddParcelsToList(list.id)
                          } else if (isBulkEmailMode) {
                            e.stopPropagation()
                            onAddParcelsToList(list.id)
                          } else {
                            const parcelCount = list.parcels?.length ?? 0
                            if (parcelCount > 0 && onViewListContents) onViewListContents(list.id)
                          }
                        }}
                        title={
                          isAddingSingleParcel 
                            ? "Click to add parcel to this list" 
                            : isBulkEmailMode
                            ? "Click to send emails to this list"
                            : (list.parcels?.length ?? 0) > 0
                            ? "Click to view list contents"
                            : "List is empty"
                        }
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isSelected && !isAddingSingleParcel && (
                              <span 
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: LIST_HIGHLIGHT_COLORS[selectedListIds.indexOf(list.id)] }}
                                title={`Color ${selectedListIds.indexOf(list.id) + 1}`}
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
                              <span className="font-medium text-sm truncate">
                                {list.name}
                              </span>
                            )}
                            {!isListOwnedByUser(list) && (
                              <Users className="h-3.5 w-3.5 flex-shrink-0 text-white/70" title="Shared with you" aria-hidden />
                            )}
                            <VisibilityBadge resource={list} />
                          </div>
                          <span className="text-xs text-gray-500">{list.parcels?.length ?? 0} parcels</span>
                          <EntityTagPills
                            entity={list}
                            tagRegistry={tagRegistry}
                            type="lists"
                            className="mt-1"
                          />
                        </div>
                        {selectedParcelsCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onAddParcelsToList(list.id)
                            }}
                            onMouseEnter={addParcelsBtnHoverEnter}
                            onMouseLeave={addParcelsBtnHoverLeave}
                            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors"
                            style={{ color: parcelBoundaryColor }}
                            title="Add selected parcels to this list"
                          >
                            <Plus className="h-5 w-5" strokeWidth={2.5} color={parcelBoundaryColor} />
                          </button>
                        )}
                        <div className="relative ml-2 flex items-center gap-1">
                          {!isAddingSingleParcel && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleHighlight(list.id)
                                }}
                                title={isSelected ? "Remove highlight" : "Highlight on map"}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8",
                                  openDropdownListId === list.id && "opacity-90"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openDropdownListId === list.id ? closeDropdown() : openDropdown(list.id, e)
                                }}
                                title="List options"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                )}
              </div>
        </div>
        <div ref={tagPickerPortalRef} className="contents" aria-hidden />
      </DialogContent>
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

    {openDropdownListId && dropdownAnchor && typeof document !== 'undefined' && createPortal(
      (() => {
        const list = allLists.find(l => l.id === openDropdownListId)
        if (!list) return null
        return (
          <div data-list-panel-dropdown className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
            <div className="fixed inset-0 z-[10001]" onClick={closeDropdown} aria-hidden />
            <div
              className="map-panel list-panel fixed z-[10002] rounded-xl min-w-[180px] pt-1 overflow-hidden"
              style={{ top: dropdownAnchor.top, left: dropdownAnchor.left }}
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              {onExportList && (
                <button type="button" onClick={() => { closeDropdown(); onExportList(list.id) }} className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors">
                  <FileDown className="h-4 w-4 flex-shrink-0" />
                  Export list
                </button>
              )}
              {onShareList && isListOwnedByUser(list) && (
                <button type="button" onClick={() => { closeDropdown(); setShareListId(list.id); setShareEmail('') }} className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors">
                  <Share2 className="h-4 w-4 flex-shrink-0" />
                  Share list
                </button>
              )}
              {onRenameList && isListOwnedByUser(list) && (
                <button type="button" onClick={() => {
                  closeDropdown()
                  setRenameValue(list.name)
                  setRenamingListId(list.id)
                }} className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors">
                  <Pencil className="h-4 w-4 flex-shrink-0" />
                  Rename list
                </button>
              )}
              {getToken && isListOwnedByUser(list) && (
                <button
                  type="button"
                  onClick={() => {
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
                    setTagEditListId(list.id)
                    closeDropdown()
                    requestAnimationFrame(() => setTagPickerOpen(true))
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                >
                  <Tag className="h-4 w-4 flex-shrink-0" />
                  Tags
                </button>
              )}
              {isListOwnedByUser(list) && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { closeDropdown(); handleDeleteListClick(list) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleDeleteListClick(list)}
                  className="list-panel-delete-btn w-full px-3 py-2 pb-2 rounded-b-xl text-left text-sm flex items-center gap-2 transition-colors text-red-400 hover:bg-red-600/80 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 flex-shrink-0" />
                  Delete list
                </div>
              )}
            </div>
          </div>
        )
      })(),
      document.getElementById('modal-root') || document.body
    )}

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

