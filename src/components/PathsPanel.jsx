import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, Trash2, MoreVertical, Pencil, Route, Share2, Users, Tag } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { LeadSharingIcon } from './ResourceSharePicker'
import { ShareResourceDialog } from './ShareResourceDialog'
import { VISIBILITY, normalizeResourceVisibility } from '@/utils/access'
import { filterByTags } from '@/utils/tags'
import { updatePathTags } from '@/utils/paths'
import { PanelFilterMenu } from './tags/PanelFilterMenu'
import { EntityTagPills } from './tags/EntityTagPills'
import { TagPicker } from './tags/TagPicker'

const PATH_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
]

export function PathsPanel({
  isOpen,
  onClose,
  onBack,
  currentUser,
  paths = [],
  onPathsChange,
  onPathPatch,
  onDeletePath,
  onRenamePath,
  onSharePath,
  onSharePathWithTeams,
  teams = [],
  teamMembership = null,
  onValidateShareEmail,
  onCenterOnPath,
  visiblePathIds = [],
  onTogglePathVisibility,
  distanceUnit = 'miles',
  getToken,
  tagRegistry = { leads: [], deals: [], paths: [], lists: [] },
  onRefreshTags,
}) {
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [tagEditPathId, setTagEditPathId] = useState(null)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [tagPickerAnchorPosition, setTagPickerAnchorPosition] = useState(null)
  const tagPickerAnchorRef = useRef(null)
  const tagPickerPortalRef = useRef(null)
  const [openDropdownPathId, setOpenDropdownPathId] = useState(null)
  const [dropdownAnchor, setDropdownAnchor] = useState(null)
  const [renamingPathId, setRenamingPathId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)
  const [sharePathId, setSharePathId] = useState(null)
  const [localShareState, setLocalShareState] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareEmailValid, setShareEmailValid] = useState(null)
  const [shareEmailError, setShareEmailError] = useState('')
  const [isValidatingShare, setIsValidatingShare] = useState(false)
  const validateTimeoutRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setOpenDropdownPathId(null)
      setDropdownAnchor(null)
      setRenamingPathId(null)
      setRenameValue('')
      setSharePathId(null)
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
    if (isOpen && onPathsChange) onPathsChange()
  }, [isOpen, onPathsChange])

  useEffect(() => {
    if (renamingPathId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingPathId])

  const isPathOwnedByUser = (path) => path?.ownerId === currentUser?.uid

  const runValidation = useCallback(async (email) => {
    const trimmed = (email || '').trim().toLowerCase()
    if (!trimmed) { setShareEmailValid(null); setShareEmailError(''); return }
    if (!onValidateShareEmail) { setShareEmailValid(true); setShareEmailError(''); return }
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
    if (!sharePathId) return
    const trimmed = (shareEmail || '').trim().toLowerCase()
    if (!trimmed) {
      setShareEmailValid(null)
      setShareEmailError('')
      if (validateTimeoutRef.current) { clearTimeout(validateTimeoutRef.current); validateTimeoutRef.current = null }
      return
    }
    if (validateTimeoutRef.current) clearTimeout(validateTimeoutRef.current)
    validateTimeoutRef.current = setTimeout(() => { validateTimeoutRef.current = null; runValidation(shareEmail) }, 400)
    return () => { if (validateTimeoutRef.current) clearTimeout(validateTimeoutRef.current) }
  }, [sharePathId, shareEmail, runValidation])

  useEffect(() => {
    if (!sharePathId) {
      setLocalShareState(null)
      return
    }
    const path = paths.find((p) => p.id === sharePathId)
    const norm = normalizeResourceVisibility(path || {})
    setLocalShareState({
      visibility: norm.visibility || VISIBILITY.PRIVATE,
      sharedMemberUids: norm.sharedMemberUids || [],
    })
  }, [sharePathId])

  const handleShareChange = useCallback(
    (next) => {
      if (!onSharePathWithTeams || !sharePathId) return
      setLocalShareState(next)
      void (async () => {
        try {
          await onSharePathWithTeams(sharePathId, next)
        } catch (e) {
          const path = paths.find((p) => p.id === sharePathId)
          const norm = normalizeResourceVisibility(path || {})
          setLocalShareState({
            visibility: norm.visibility || VISIBILITY.PRIVATE,
            sharedMemberUids: norm.sharedMemberUids || [],
          })
          showToast(e.message || 'Failed to update sharing', 'error')
        }
      })()
    },
    [onSharePathWithTeams, sharePathId, paths]
  )

  const handleShareSave = () => {
    if (!sharePathId || !onSharePath) return
    const email = shareEmail.trim().toLowerCase()
    if (!email) { showToast('Please enter an email', 'error'); return }
    if (shareEmailValid === false) { showToast('No user found with this email', 'error'); return }
    if (shareEmailValid !== true && onValidateShareEmail) { showToast('Please wait for email validation', 'error'); return }
    const path = allPaths.find(p => p.id === sharePathId)
    const current = path?.sharedWith || []
    if (current.some(e => (e || '').toLowerCase() === email)) { showToast('This email is already in the share list', 'error'); return }
    onSharePath(sharePathId, [...current, email])
    setShareEmail('')
    setShareEmailValid(null)
    setShareEmailError('')
    showToast('Email added to share list', 'success')
  }

  const handleRemoveSharedEmail = (emailToRemove) => {
    if (!sharePathId || !onSharePath) return
    const path = allPaths.find(p => p.id === sharePathId)
    const current = path?.sharedWith || []
    const updated = current.filter(e => (e || '').toLowerCase() !== (emailToRemove || '').toLowerCase())
    onSharePath(sharePathId, updated)
  }

  const MENU_WIDTH = 160
  const MENU_PADDING = 8
  const openDropdown = (pathId, event) => {
    event.stopPropagation()
    const el = event.currentTarget
    tagPickerAnchorRef.current = el
    const rect = el.getBoundingClientRect()
    let top = rect.bottom + 4
    let left = rect.right - MENU_WIDTH
    if (left < MENU_PADDING) left = MENU_PADDING
    if (left + MENU_WIDTH > window.innerWidth - MENU_PADDING) left = window.innerWidth - MENU_WIDTH - MENU_PADDING
    const menuHeight = 120
    if (top + menuHeight > window.innerHeight - MENU_PADDING) top = Math.max(MENU_PADDING, rect.top - menuHeight - 4)
    setDropdownAnchor({ top, left })
    setOpenDropdownPathId(pathId)
  }

  const closeDropdown = () => {
    setOpenDropdownPathId(null)
    setDropdownAnchor(null)
  }

  const handleStartRename = (path) => {
    setRenamingPathId(path.id)
    setRenameValue(path.name)
    closeDropdown()
  }

  const handleRenameSubmit = async (pathId) => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      showToast('Name cannot be empty', 'error')
      return
    }
    try {
      if (onRenamePath) await onRenamePath(pathId, trimmed)
      showToast('Path renamed', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to rename', 'error')
    }
    setRenamingPathId(null)
    setRenameValue('')
  }

  const handleDeleteClick = (path) => {
    closeDropdown()
    if (onDeletePath) onDeletePath(path)
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  const allPaths = useMemo(() => {
    const list = [...(paths || [])]
    list.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime()
      const tb = new Date(b.createdAt || 0).getTime()
      if (tb !== ta) return tb - ta
      return String(b.id || '').localeCompare(String(a.id || ''))
    })
    return list
  }, [paths])

  const filteredPaths = useMemo(
    () => filterByTags(allPaths, selectedTagIds),
    [allPaths, selectedTagIds]
  )

  const handlePathTagsChange = useCallback(async (pathId, { tagIds, tagMeta }) => {
    if (!getToken) return
    const previous = allPaths.find((p) => p.id === pathId)
    onPathPatch?.(pathId, { tagIds, tagMeta })
    try {
      const saved = await updatePathTags(getToken, pathId, { tagIds, tagMeta })
      onPathPatch?.(pathId, { tagIds: saved.tagIds, tagMeta: saved.tagMeta })
    } catch (e) {
      if (previous) {
        onPathPatch?.(pathId, { tagIds: previous.tagIds, tagMeta: previous.tagMeta })
      }
      showToast(e.message || 'Could not update tags', 'error')
      throw e
    }
  }, [getToken, allPaths, onPathPatch])

  const handlePanelBack = () => {
    onBack?.() ?? onClose?.()
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handlePanelBack() }}>
        <DialogContent
          className="map-panel list-panel fullscreen-panel"
          showCloseButton={false}
          hideOverlay
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-paths-panel-dropdown]')) e.preventDefault()
            if (e.target.closest?.('[data-tag-picker-menu]')) e.preventDefault()
            if (e.target.closest?.('[data-tag-picker-trigger]')) e.preventDefault()
            if (e.target.closest?.('[data-panel-filter-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={PANEL_LIST_HEADER_CLASS} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">View and manage your recorded GPS paths</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Paths">
              {allPaths.length > 0 && (
                <PanelFilterMenu
                  tags={tagRegistry.paths || []}
                  selectedTagIds={selectedTagIds}
                  onTagIdsChange={setSelectedTagIds}
                />
              )}
            </PanelHeader>
          </DialogHeader>

          <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="space-y-4">
              {allPaths.length === 0 ? (
                <div className="text-center py-8">
                  <Route className="h-10 w-10 mx-auto mb-3 text-gray-400 opacity-60" />
                  <p className="text-gray-500 text-sm">No paths recorded yet.</p>
                  <p className="text-gray-400 text-xs mt-1">Tap the record button on the map to start tracking.</p>
                </div>
              ) : filteredPaths.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">No paths match the selected tags.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPaths.map((path, idx) => {
                    const isVisible = visiblePathIds.includes(path.id)
                    const color = PATH_COLORS[idx % PATH_COLORS.length]
                    const isRenaming = renamingPathId === path.id
                    const cityLabel = path.city?.trim() || 'Unknown city'
                    const distLabel =
                      typeof path.distanceMiles === 'number'
                        ? distanceUnit === 'km'
                          ? `${Math.round(path.distanceMiles * 1.60934 * 100) / 100} km`
                          : `${path.distanceMiles} mi`
                        : null
                    const ptsCount = path.points?.length ?? 0
                    const metaLine = [cityLabel, distLabel, `${ptsCount} pts`].filter(Boolean).join(', ')

                    return (
                      <div
                        key={path.id}
                        className={cn(
                          "flex items-start justify-between gap-2 p-3 rounded-lg transition-all cursor-pointer",
                          isVisible
                            ? "border border-solid bg-white/[0.08]"
                            : "map-panel-list-item border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                        )}
                        style={isVisible ? {
                          borderColor: color,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        } : undefined}
                        onClick={() => {
                          if (!isRenaming && onCenterOnPath) onCenterOnPath(path.id)
                        }}
                      >
                        <div className="flex gap-3 flex-1 min-w-0 items-start">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                            style={{
                              backgroundColor: isVisible ? color : 'rgba(156, 163, 175, 0.5)'
                            }}
                            aria-hidden
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              {isRenaming ? (
                                <input
                                  ref={renameInputRef}
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameSubmit(path.id)
                                    if (e.key === 'Escape') { setRenamingPathId(null); setRenameValue('') }
                                  }}
                                  onBlur={() => handleRenameSubmit(path.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-medium text-sm bg-transparent border-b border-white/40 outline-none w-full min-w-0"
                                />
                              ) : (
                                <span className="font-medium text-sm truncate">{path.name}</span>
                              )}
                              <LeadSharingIcon
                                resource={path}
                                collaboratorHint={!isPathOwnedByUser(path)}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">
                              {metaLine}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                              {formatDate(path.createdAt) || '—'}
                            </p>
                            <EntityTagPills
                              entity={path}
                              tagRegistry={tagRegistry}
                              type="paths"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        <div className="relative flex flex-shrink-0 items-center gap-1 pt-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (onTogglePathVisibility) onTogglePathVisibility(path.id)
                            }}
                            title={isVisible ? 'Hide path' : 'Show on map'}
                          >
                            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 opacity-50" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", openDropdownPathId === path.id && "opacity-90")}
                            onClick={(e) => {
                              e.stopPropagation()
                              openDropdownPathId === path.id ? closeDropdown() : openDropdown(path.id, e)
                            }}
                            title="Path options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
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

      {openDropdownPathId && dropdownAnchor && typeof document !== 'undefined' && createPortal(
        (() => {
          const path = allPaths.find(p => p.id === openDropdownPathId)
          if (!path) return null
          return (
            <div data-paths-panel-dropdown className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
              <div className="fixed inset-0 z-[10001]" onClick={closeDropdown} aria-hidden />
              <div
                className="map-panel list-panel fixed z-[10002] rounded-xl min-w-[160px] pt-1 overflow-hidden"
                style={{ top: dropdownAnchor.top, left: dropdownAnchor.left }}
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleStartRename(path)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                >
                  <Pencil className="h-4 w-4 flex-shrink-0" />
                  Rename
                </button>
                {getToken && isPathOwnedByUser(path) && (
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
                      setTagEditPathId(path.id)
                      closeDropdown()
                      requestAnimationFrame(() => setTagPickerOpen(true))
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                  >
                    <Tag className="h-4 w-4 flex-shrink-0" />
                    Tags
                  </button>
                )}
                {onSharePath && (
                  <button
                    type="button"
                    onClick={() => { closeDropdown(); setSharePathId(path.id); setShareEmail('') }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors"
                  >
                    <Share2 className="h-4 w-4 flex-shrink-0" />
                    Share
                  </button>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleDeleteClick(path)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDeleteClick(path)}
                  className="list-panel-delete-btn w-full px-3 py-2 pb-2 rounded-b-xl text-left text-sm flex items-center gap-2 transition-colors text-red-400 hover:bg-red-600/80 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 flex-shrink-0" />
                  Delete
                </div>
              </div>
            </div>
          )
        })(),
        document.getElementById('modal-root') || document.body
      )}

      {sharePathId && (() => {
        const path = allPaths.find((p) => p.id === sharePathId)
        const shareState = localShareState ?? { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }
        const activeTeam = teams?.[0] || null
        const allowExternalSharing = teamMembership?.allowExternalSharing === true
        const closeSharePath = () => {
          setSharePathId(null)
          setShareEmail('')
          setShareEmailValid(null)
          setShareEmailError('')
        }
        return (
          <ShareResourceDialog
            open={!!sharePathId}
            onOpenChange={(open) => { if (!open) closeSharePath() }}
            title="Share path"
            team={activeTeam}
            showTeamPicker={Boolean(onSharePathWithTeams && activeTeam)}
            shareState={shareState}
            onShareStateChange={handleShareChange}
            allowExternalSharing={allowExternalSharing}
            sharedWithEmails={path?.sharedWith || []}
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

      {tagEditPathId && tagPickerOpen && (
        <TagPicker
          type="paths"
          entity={allPaths.find((p) => p.id === tagEditPathId)}
          tagRegistry={tagRegistry}
          getToken={getToken}
          onRegistryChange={onRefreshTags}
          hideWhenEmpty={false}
          open={tagPickerOpen}
          onOpenChange={(open) => {
            setTagPickerOpen(open)
            if (!open) {
              setTagEditPathId(null)
              setTagPickerAnchorPosition(null)
            }
          }}
          anchorPosition={tagPickerAnchorPosition}
          portalContainerRef={tagPickerPortalRef}
          onTagsChange={(tags) => handlePathTagsChange(tagEditPathId, tags)}
        />
      )}
    </>
  )
}
