import { useState, useEffect } from 'react'
import { resolveActionBarLayout } from '../config/actionBarLayout'

function readWidth() {
  if (typeof window === 'undefined') return 1024
  return window.innerWidth
}

/**
 * Returns which action-bar items are visible vs relegated to the Menu overflow.
 */
export function useActionBarLayout() {
  const [layout, setLayout] = useState(() => resolveActionBarLayout(readWidth()))

  useEffect(() => {
    const update = () => setLayout(resolveActionBarLayout(window.innerWidth))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return layout
}
