import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Eye, EyeOff, Trash2, MoreVertical, Pencil, Route, Share2, Tag, Search } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { ignoreRadixMapPanelDismiss } from './ui/panelDialogUtils'
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
import { getPathColor } from '../utils/pathColors'

const MENU_WIDTH = 180
const MENU_PADDING = 8

const PATH_TABS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'shared', label: 'Shared' },
  { id: 'visible', label: 'On map' },
]

function filterPathsByTab(paths, tab, ownerId, visiblePathIds) {
  switch (tab) {
    case 'mine':
      return paths.filter((p) => p.ownerId === ownerId)
    case 'shared':
      return paths.filter((p) => p.ownerId !== ownerId)
    case 'visible':
      return paths.filter((p) => visiblePathIds.includes(p.id))
    default:
      return paths
  }
}

export function PathsPanel({
  isOpen,
  panelDockSlot,
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
  pathColorMap,
}) {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [tagEditPathId, setTagEditPathId] = useState(null)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [tagPickerAnchorPosition, setTagPickerAnchorPosition] = useState(null)
  const tagPickerAnchorRef = useRef(null)
  const tagPickerPortalRef = useRef(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const menuTriggerRef = useRef(null)
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
      setTab('all')
      setSearch('')
      setOpenMenuId(null)
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

  const ownerId = currentUser?.uid
  const isPathOwnedByUser = (path) => path?.ownerId === ownerId

  const pathHasMenuOptions = useCallback((path) => {
    if (path?.ownerId !== ownerId) return false
    return !!(onRenamePath || getToken || onSharePath || onDeletePath)
  }, [ownerId, onRenamePath, getToken, onSharePath, onDeletePath])

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
  }, [sharePathId, paths])

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
    const path = allPaths.find((p) => p.id === sharePathId)
    const current = path?.sharedWith || []
    if (current.some((e) => (e || '').toLowerCase() === email)) { showToast('This email is already in the share list', 'error'); return }
    onSharePath(sharePathId, [...current, email])
    setShareEmail('')
    setShareEmailValid(null)
    setShareEmailError('')
    showToast('Email added to share list', 'success')
  }

  const handleRemoveSharedEmail = (emailToRemove) => {
    if (!sharePathId || !onSharePath) return
    const path = allPaths.find((p) => p.id === sharePathId)
    const current = path?.sharedWith || []
    const updated = current.filter((e) => (e || '').toLowerCase() !== (emailToRemove || '').toLowerCase())
    onSharePath(sharePathId, updated)
  }

  const openMenu = (pathId, e) => {
    e.stopPropagation()
    menuTriggerRef.current = e.currentTarget
    tagPickerAnchorRef.current = e.currentTarget
    setOpenMenuId(pathId)
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
    setOpenMenuId(null)
    if (onDeletePath) onDeletePath(path)
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return '—'
    }
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

  const tabCounts = useMemo(() => ({
    all: allPaths.length,
    mine: allPaths.filter((p) => p.ownerId === ownerId).length,
    shared: allPaths.filter((p) => p.ownerId !== ownerId).length,
    visible: allPaths.filter((p) => visiblePathIds.includes(p.id)).length,
  }), [allPaths, ownerId, visiblePathIds])

  const filteredPaths = useMemo(() => {
    let result = filterPathsByTab(allPaths, tab, ownerId, visiblePathIds)
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((p) => {
        const name = (p.name || '').toLowerCase()
        const city = (p.city || '').toLowerCase()
        return name.includes(q) || city.includes(q)
      })
    }
    return filterByTags(result, selectedTagIds)
  }, [allPaths, tab, ownerId, visiblePathIds, search, selectedTagIds])

  const openMenuPath = openMenuId ? allPaths.find((p) => p.id === openMenuId) : null

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
      <Dialog open={isOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
        <DialogContent
          className="map-panel list-panel paths-panel fullscreen-panel flex flex-col min-h-0 p-0"
          panelDockSlot={panelDockSlot}
          showCloseButton={false}
          hideOverlay
          suppressBackdrop
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-paths-panel-menu]')) e.preventDefault()
            if (e.target.closest?.('[data-tag-picker-menu]')) e.preventDefault()
            if (e.target.closest?.('[data-tag-picker-trigger]')) e.preventDefault()
            if (e.target.closest?.('[data-panel-filter-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
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

          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-6 py-3 space-y-1.5"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="mb-3 space-y-2">
              <div className="hidden md:flex gap-4 flex-wrap" role="tablist" aria-label="Path filters">
                {PATH_TABS.map(({ id, label }) => {
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
                  placeholder="Search paths by name or city…"
                  className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                  aria-label="Search paths"
                />
              </div>
            </div>

            {allPaths.length === 0 ? (
              <div className="text-center py-16">
                <Route className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm opacity-60">No paths recorded yet.</p>
                <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Tap the record button on the map to start tracking a route.</p>
              </div>
            ) : filteredPaths.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm opacity-60">
                  {search.trim() || selectedTagIds.length > 0
                    ? 'No paths match your filters.'
                    : `No ${tab === 'all' ? '' : `${PATH_TABS.find((t) => t.id === tab)?.label?.toLowerCase() || tab} `}paths yet.`}
                </p>
              </div>
            ) : (
              filteredPaths.map((path) => {
                const isVisible = visiblePathIds.includes(path.id)
                const pathColor = getPathColor(path.id, pathColorMap)
                const cityLabel = path.city?.trim() || 'Unknown city'
                const distLabel =
                  typeof path.distanceMiles === 'number'
                    ? distanceUnit === 'km'
                      ? `${Math.round(path.distanceMiles * 1.60934 * 100) / 100} km`
                      : `${path.distanceMiles} mi`
                    : null
                const ptsCount = path.points?.length ?? 0

                return (
                  <div
                    key={path.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'w-full text-left map-panel-list-item leads-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10 cursor-pointer',
                      isVisible && 'border-solid bg-white/[0.08]'
                    )}
                    style={isVisible ? {
                      borderColor: pathColor,
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    } : undefined}
                    onClick={() => {
                      if (renamingPathId !== path.id && onCenterOnPath) onCenterOnPath(path.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (renamingPathId !== path.id && onCenterOnPath) onCenterOnPath(path.id)
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span
                          className={cn(
                            'w-2.5 h-2.5 rounded-full shrink-0',
                            !isVisible && 'opacity-40'
                          )}
                          style={{ backgroundColor: pathColor }}
                          aria-hidden
                        />
                        {renamingPathId === path.id ? (
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
                            className="font-medium text-sm bg-transparent border-b border-white/40 outline-none w-full min-w-0 py-0.5"
                          />
                        ) : (
                          <span className="font-medium truncate">{path.name}</span>
                        )}
                        <LeadSharingIcon
                          resource={path}
                          collaboratorHint={!isPathOwnedByUser(path)}
                        />
                      </div>
                      <p className="text-sm opacity-70 truncate">
                        {[cityLabel, distLabel, `${ptsCount} pt${ptsCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-sm opacity-50">{formatDate(path.createdAt)}</p>
                      <EntityTagPills
                        entity={path}
                        tagRegistry={tagRegistry}
                        type="paths"
                        className="mt-0.5"
                      />
                    </div>
                    <button
                      type="button"
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onTogglePathVisibility) onTogglePathVisibility(path.id)
                      }}
                      title={isVisible ? 'Remove highlight' : 'Highlight on map'}
                      aria-pressed={isVisible}
                    >
                      {isVisible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                    {pathHasMenuOptions(path) && (
                      <button
                        type="button"
                        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10"
                        onClick={(e) => openMenu(path.id, e)}
                        aria-label={`Options for ${path.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <div ref={tagPickerPortalRef} className="contents" aria-hidden />
        </DialogContent>
      </Dialog>

      <OptionsMenuDropdown
        open={!!openMenuPath}
        onClose={() => setOpenMenuId(null)}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
        dataAttr="data-paths-panel-menu"
      >
        {openMenuPath && (
          <>
            {onRenamePath && isPathOwnedByUser(openMenuPath) && (
              <OptionsMenuItem onClick={() => {
                setOpenMenuId(null)
                setRenameValue(openMenuPath.name)
                setRenamingPathId(openMenuPath.id)
              }}>
                <Pencil className="h-4 w-4" />
                Rename
              </OptionsMenuItem>
            )}
            {getToken && isPathOwnedByUser(openMenuPath) && (
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
                setTagEditPathId(openMenuPath.id)
                setOpenMenuId(null)
                requestAnimationFrame(() => setTagPickerOpen(true))
              }}>
                <Tag className="h-4 w-4" />
                Tags
              </OptionsMenuItem>
            )}
            {onSharePath && isPathOwnedByUser(openMenuPath) && (
              <OptionsMenuItem onClick={() => {
                setOpenMenuId(null)
                setSharePathId(openMenuPath.id)
                setShareEmail('')
              }}>
                <Share2 className="h-4 w-4" />
                Share
              </OptionsMenuItem>
            )}
            {isPathOwnedByUser(openMenuPath) && onDeletePath && (
              <OptionsMenuItem destructive onClick={() => handleDeleteClick(openMenuPath)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </OptionsMenuItem>
            )}
          </>
        )}
      </OptionsMenuDropdown>

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
