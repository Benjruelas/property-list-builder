import { useEffect, useRef, useState } from 'react'

const DEFAULT_BATCH = 80

/**
 * Incremental list windowing for long, variable-height lists.
 *
 * Renders only the first `batch` items and grows the window as the sentinel
 * element approaches the viewport, so a 5k-row list mounts ~80 DOM rows
 * instead of 5k. Works with variable row heights, grouping, accordions and
 * native drag-and-drop (unlike fixed-height windowing).
 *
 * Usage:
 *   const { visibleItems, sentinel } = useWindowedList(rows)
 *   ...
 *   {visibleItems.map(renderRow)}
 *   {sentinel}
 */
export function useWindowedList(items, batch = DEFAULT_BATCH, sentinelTag = 'div') {
  const [count, setCount] = useState(batch)
  const sentinelRef = useRef(null)
  const total = items?.length || 0
  const visibleCount = Math.min(count, total)
  const hasMore = visibleCount < total

  useEffect(() => {
    if (!hasMore) return undefined
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      // No observer support — render everything rather than trap the list.
      setCount(total)
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + batch, total))
        }
      },
      { rootMargin: '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, total, batch])

  const SentinelTag = sentinelTag
  const sentinel = hasMore ? (
    <SentinelTag ref={sentinelRef} aria-hidden="true" style={{ height: 1, listStyle: 'none' }} />
  ) : null

  return {
    visibleItems: hasMore ? items.slice(0, visibleCount) : (items || []),
    sentinel,
    hasMore,
  }
}

/**
 * Component form of `useWindowedList`, usable inside `.map()` loops (where
 * hooks cannot be called). `children` is a render function per item.
 */
export function WindowedItems({ items, batch = DEFAULT_BATCH, sentinelTag = 'div', children }) {
  const { visibleItems, sentinel } = useWindowedList(items, batch, sentinelTag)
  return (
    <>
      {visibleItems.map(children)}
      {sentinel}
    </>
  )
}
