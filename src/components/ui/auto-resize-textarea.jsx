import { useRef, useLayoutEffect, useCallback, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const AutoResizeTextarea = forwardRef(function AutoResizeTextarea(
  { className, value, onChange, minRows = 2, ...props },
  forwardedRef
) {
  const innerRef = useRef(null)
  const ref = forwardedRef || innerRef

  const syncHeight = useCallback((el = ref.current) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [ref])

  useLayoutEffect(() => {
    syncHeight()
  }, [value, syncHeight])

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        syncHeight(e.target)
      }}
      className={cn('resize-none overflow-hidden', className)}
      {...props}
    />
  )
})
