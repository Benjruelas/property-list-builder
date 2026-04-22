import { useCallback, useRef } from 'react'
import { Trash2, Type, Calendar, CheckSquare, PenLine } from 'lucide-react'

const FIELD_ICON = {
  text: Type,
  date: Calendar,
  checkbox: CheckSquare,
  signature: PenLine
}

const MIN_PCT = 0.01

/**
 * Absolutely-positioned overlay for a single field on a rendered PDF page.
 *
 * - In builder mode: draggable + resizable, shows label + delete button.
 * - In fill mode: purely layout (the parent renders the input inside).
 *
 * Pointer events (not mouse) so touch + stylus work on mobile.
 */
export function FieldOverlay({
  field,
  selected,
  readOnly = false,
  onChange,
  onSelect,
  onDelete,
  children,
  className = ''
}) {
  const rootRef = useRef(null)
  const dragState = useRef(null)

  const Icon = FIELD_ICON[field.type] || Type

  const beginDrag = useCallback((mode, startEvt) => {
    if (readOnly) return
    startEvt.preventDefault()
    startEvt.stopPropagation()
    const target = rootRef.current
    if (!target) return
    const parent = target.parentElement
    const parentRect = parent?.getBoundingClientRect()
    if (!parentRect) return
    target.setPointerCapture?.(startEvt.pointerId)
    dragState.current = {
      mode,
      pointerId: startEvt.pointerId,
      startX: startEvt.clientX,
      startY: startEvt.clientY,
      startPct: { x: field.x, y: field.y, width: field.width, height: field.height },
      parentW: parentRect.width,
      parentH: parentRect.height,
    }
  }, [field.x, field.y, field.width, field.height, readOnly])

  const onPointerMove = useCallback((e) => {
    const state = dragState.current
    if (!state || e.pointerId !== state.pointerId) return
    const dxPct = (e.clientX - state.startX) / state.parentW
    const dyPct = (e.clientY - state.startY) / state.parentH
    let { x, y, width, height } = state.startPct
    if (state.mode === 'move') {
      x = Math.max(0, Math.min(1 - width, x + dxPct))
      y = Math.max(0, Math.min(1 - height, y + dyPct))
    } else if (state.mode === 'resize-se') {
      width = Math.max(MIN_PCT, Math.min(1 - x, width + dxPct))
      height = Math.max(MIN_PCT, Math.min(1 - y, height + dyPct))
    }
    onChange?.({ ...field, x, y, width, height })
  }, [field, onChange])

  const endDrag = useCallback((e) => {
    const state = dragState.current
    if (!state || e.pointerId !== state.pointerId) return
    dragState.current = null
    rootRef.current?.releasePointerCapture?.(e.pointerId)
  }, [])

  const handlePointerDown = (e) => {
    if (readOnly) return
    onSelect?.(field.id)
    if (e.target?.dataset?.resizeHandle) {
      beginDrag('resize-se', e)
    } else if (!e.target?.closest?.('[data-field-delete]')) {
      beginDrag('move', e)
    }
  }

  return (
    <div
      ref={rootRef}
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute box-border ${readOnly ? '' : 'cursor-move'} ${className}`}
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.width * 100}%`,
        height: `${field.height * 100}%`,
        border: selected
          ? '2px solid #2563eb'
          : readOnly
            ? '1px dashed rgba(37,99,235,0.45)'
            : '1px dashed rgba(37,99,235,0.9)',
        background: selected ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {!readOnly && (
        <div
          className="form-field-overlay-label absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap"
          style={{ pointerEvents: 'none' }}
        >
          <Icon className="h-3 w-3" />
          <span className="max-w-[140px] truncate">
            {field.label || field.type}
            {field.required ? ' *' : ''}
          </span>
        </div>
      )}

      {children}

      {!readOnly && selected && (
        <>
          <button
            type="button"
            data-field-delete
            onClick={(e) => { e.stopPropagation(); onDelete?.(field.id) }}
            className="form-field-overlay-delete absolute -top-2 -right-2 h-5 w-5 rounded-full flex items-center justify-center shadow"
            title="Delete field"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <div
            data-resize-handle
            className="form-field-overlay-resize absolute -bottom-1 -right-1 h-3 w-3 rounded-sm cursor-se-resize"
            style={{ touchAction: 'none' }}
          />
        </>
      )}
    </div>
  )
}

export default FieldOverlay
