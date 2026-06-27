import { useEffect, useRef, useLayoutEffect } from 'react'
import { cn } from '@/lib/utils'

export function AnnotationTextEditor({
  open,
  value,
  style,
  onChange,
  onCommit,
  onCancel,
}) {
  const ref = useRef(null)

  const syncHeight = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useLayoutEffect(() => {
    if (!open) return
    syncHeight()
  }, [open, value, style])

  useEffect(() => {
    if (!open) return undefined
    const el = ref.current
    el?.focus()
    el?.select()
    return undefined
  }, [open])

  if (!open) return null

  return (
    <div
      className="photo-annotator-text-editor-wrap"
      style={
        style
          ? {
              left: style.left,
              top: style.top,
              width: style.width,
            }
          : undefined
      }
    >
      <div
        className="photo-annotator-text-editor-field"
        style={style?.width != null ? { width: style.width } : undefined}
      >
        <textarea
          ref={ref}
          className={cn(
            'photo-annotator-text-editor',
            'w-full resize-none overflow-hidden border-0 bg-black/80 text-white',
            'px-2 py-2 outline-none rounded-md'
          )}
          style={{
            width: style?.width,
            fontSize: style?.fontSize,
            lineHeight: 1.25,
            textAlign: 'left',
            color: style?.textColor || '#ffffff',
          }}
          value={value}
          rows={1}
          placeholder="Enter text"
          onChange={(e) => {
            onChange?.(e.target.value)
            syncHeight()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel?.()
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onCommit?.()
            }
          }}
        />
      </div>
      <div className="photo-annotator-text-editor-actions">
        <button type="button" className="photo-annotator-text-editor-btn" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="photo-annotator-text-editor-btn photo-annotator-text-editor-btn--primary" onMouseDown={(e) => e.preventDefault()} onClick={onCommit}>
          Done
        </button>
      </div>
    </div>
  )
}
