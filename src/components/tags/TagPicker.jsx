import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, Check } from 'lucide-react'
import { createPortal } from 'react-dom'
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer'
import { cn } from '@/lib/utils'
import { TagChip } from './TagChip'
import { createTag, resolveTagMeta, buildTagMetaFromIds } from '@/utils/tags'
import { showToast } from '../ui/toast'

function menuPositionFromAnchor(anchorEl, menuEl, fallbackPosition) {
  if (anchorEl?.getBoundingClientRect) {
    const rect = anchorEl.getBoundingClientRect()
    return {
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 200),
    }
  }
  if (fallbackPosition) {
    return {
      top: fallbackPosition.top,
      left: fallbackPosition.left,
      minWidth: fallbackPosition.minWidth || 200,
    }
  }
  return { top: 80, left: 24, minWidth: 200 }
}

export function TagPicker({
  type,
  entity,
  tagRegistry,
  onTagsChange,
  getToken,
  onRegistryChange,
  disabled = false,
  compact = false,
  hideWhenEmpty = true,
  showAddTrigger = false,
  open: controlledOpen,
  onOpenChange,
  anchorEl = null,
  anchorPosition = null,
  /** Keep menu in DOM under the trigger (e.g. inside a modal dialog) instead of portaling to #modal-root */
  inline = false,
  /** Portal into this element (e.g. a node inside an open dialog) so focus trap + outside-click behave correctly */
  portalContainerRef = null,
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [saving, setSaving] = useState(false)
  const menuRef = useRef(null)
  const inlineWrapperRef = useRef(null)
  const ignoreOutsideUntilRef = useRef(0)
  const appliedIdsRef = useRef(entity?.tagIds || [])
  const tagSyncInFlightRef = useRef(0)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = useCallback((value) => {
    onOpenChange?.(value)
    if (!isControlled) setInternalOpen(value)
  }, [onOpenChange, isControlled])

  const definitions = tagRegistry?.[type] || []
  const [appliedIds, setAppliedIds] = useState(() => entity?.tagIds || [])

  useEffect(() => {
    const ids = entity?.tagIds || []
    appliedIdsRef.current = ids
    setAppliedIds(ids)
  }, [entity?.id])

  useEffect(() => {
    if (tagSyncInFlightRef.current > 0) return
    const ids = entity?.tagIds || []
    const same =
      ids.length === appliedIdsRef.current.length &&
      ids.every((id, i) => id === appliedIdsRef.current[i])
    if (!same) {
      appliedIdsRef.current = ids
      setAppliedIds(ids)
    }
  }, [entity?.tagIds, entity?.id])

  const appliedMeta = useMemo(() => {
    const fromIds = buildTagMetaFromIds(appliedIds, tagRegistry, type)
    if (fromIds.length > 0) return fromIds
    return resolveTagMeta(entity, tagRegistry, type)
  }, [appliedIds, entity, tagRegistry, type])
  const hasPills = appliedMeta.length > 0

  const position = useMemo(() => {
    if (!open || inline) return null
    return menuPositionFromAnchor(anchorEl, menuRef.current, anchorPosition)
  }, [open, inline, anchorEl, anchorPosition])

  useEffect(() => {
    if (open) ignoreOutsideUntilRef.current = Date.now() + 250
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (Date.now() < ignoreOutsideUntilRef.current) return
      if (e.target?.closest?.('[data-tag-picker-menu]')) return
      if (menuRef.current?.contains(e.target)) return
      if (inlineWrapperRef.current?.contains(e.target)) return
      if (anchorEl?.contains?.(e.target)) return
      if (e.target?.closest?.('[data-tag-picker-trigger]')) return
      setOpen(false)
    }
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true)
    }, 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, inline, anchorEl, setOpen])

  const revertAppliedIds = useCallback(() => {
    const ids = entity?.tagIds || []
    appliedIdsRef.current = ids
    setAppliedIds(ids)
  }, [entity?.tagIds])

  const applyTagIds = (nextIds) => {
    if (!entity || saving) return
    const tagMeta = buildTagMetaFromIds(nextIds, tagRegistry, type)
    tagSyncInFlightRef.current += 1
    const result = onTagsChange?.({ tagIds: nextIds, tagMeta })
    if (result?.then) {
      result
        .catch((e) => {
          revertAppliedIds()
          showToast(e.message || 'Could not update tags', 'error')
        })
        .finally(() => {
          tagSyncInFlightRef.current = Math.max(0, tagSyncInFlightRef.current - 1)
        })
    } else {
      tagSyncInFlightRef.current = Math.max(0, tagSyncInFlightRef.current - 1)
    }
  }

  const toggleTag = (tagId) => {
    const base = appliedIdsRef.current
    const next = base.includes(tagId)
      ? base.filter((id) => id !== tagId)
      : [...base, tagId]
    appliedIdsRef.current = next
    setAppliedIds(next)
    ignoreOutsideUntilRef.current = Date.now() + 250
    applyTagIds(next)
  }

  const handleCreate = async (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    const name = createName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const tag = await createTag(getToken, type, name)
      onRegistryChange?.(tag)
      const base = appliedIdsRef.current
      const nextIds = base.includes(tag.id) ? base : [...base, tag.id]
      appliedIdsRef.current = nextIds
      setAppliedIds(nextIds)
      const mergedRegistry = {
        ...tagRegistry,
        [type]: [...definitions.filter((t) => t.id !== tag.id), tag],
      }
      const tagMeta = buildTagMetaFromIds(nextIds, mergedRegistry, type)
      const result = onTagsChange?.({ tagIds: nextIds, tagMeta })
      if (result?.then) await result
      setCreateName('')
    } catch (err) {
      showToast(err.message || 'Could not create tag', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (hideWhenEmpty && !hasPills && !open && !showAddTrigger) return null

  const openPicker = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (!disabled) setOpen(true)
  }

  const trigger = (hasPills || showAddTrigger) && (
    <div
      data-tag-picker-trigger
      className={cn(
        'flex flex-wrap items-center gap-1',
        compact && 'gap-0.5',
        !disabled && (hasPills || showAddTrigger) && 'cursor-pointer'
      )}
      onClick={!disabled && hasPills && !showAddTrigger ? openPicker : undefined}
      role={!disabled && (hasPills || showAddTrigger) ? 'button' : undefined}
      tabIndex={!disabled && (hasPills || showAddTrigger) ? 0 : undefined}
      onKeyDown={!disabled && (hasPills || showAddTrigger) ? (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          openPicker(e)
        }
      } : undefined}
      title={!disabled ? 'Manage tags' : undefined}
    >
      {appliedMeta.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          size="sm"
          onRemove={disabled || saving ? undefined : (t) => toggleTag(t.id)}
        />
      ))}
      {showAddTrigger && !disabled && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/25 px-2 py-0.5 text-[11px] text-white/50 hover:text-white/80 hover:border-white/40 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            openPicker(e)
          }}
        >
          <Plus className="h-3 w-3" />
          Add tag
        </button>
      )}
    </div>
  )

  const menuBody = (
    <>
      {definitions.length === 0 && (
        <p className="px-3 py-1.5 text-xs text-white/50">Create your first tag below</p>
      )}
      {definitions.map((tag) => {
        const checked = appliedIds.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 text-left"
            onClick={(e) => {
              e.stopPropagation()
              toggleTag(tag.id)
            }}
            disabled={saving || disabled}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: tag.color || '#2563eb' }}
            />
            <span className="flex-1 truncate">{tag.name}</span>
            {checked && <Check className="h-4 w-4 shrink-0 opacity-70" />}
          </button>
        )
      })}
      <div className="border-t border-white/10 mt-1 pt-2 px-2">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                handleCreate(e)
              }
            }}
            placeholder="Create tag…"
            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-white/40 outline-none focus:border-white/25"
            disabled={saving || disabled}
            maxLength={40}
          />
          <button
            type="button"
            className="shrink-0 p-1.5 rounded-md hover:bg-white/10 disabled:opacity-40"
            disabled={!createName.trim() || saving || disabled}
            title="Create tag"
            onClick={handleCreate}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  )

  const menu = open && (
    <div
      ref={menuRef}
      data-tag-picker-menu
      className={cn(
        'rounded-lg border border-white/15 bg-[#1a1f2e] shadow-xl py-2 max-h-[240px] overflow-y-auto scrollbar-hide',
        inline
          ? 'absolute z-50 top-full left-0 mt-1 w-full min-w-[200px] max-w-[280px]'
          : 'fixed z-[10060]'
      )}
      style={inline ? undefined : {
        top: position?.top,
        left: position?.left,
        minWidth: position?.minWidth,
        maxWidth: 280,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {menuBody}
    </div>
  )

  const getPortalContainer = () => {
    if (portalContainerRef?.current) return portalContainerRef.current
    if (typeof document === 'undefined') return null
    return document.getElementById('modal-root') || document.body
  }

  if (inline) {
    return (
      <div ref={inlineWrapperRef} className="relative">
        {trigger}
        {menu}
      </div>
    )
  }

  const portaledMenu = !inline && position && menu
  const portalContainer = getPortalContainer()

  return (
    <>
      {trigger}
      {portaledMenu && portalContainer && createPortal(
        <DismissableLayerBranch>{portaledMenu}</DismissableLayerBranch>,
        portalContainer
      )}
    </>
  )
}
