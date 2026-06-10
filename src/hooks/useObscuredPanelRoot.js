import { useEffect } from 'react'

/** Mark a panel root inert (and blur focused descendants) while a nested detail overlay is open. */
export function useObscuredPanelRoot(ref, obscured) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (obscured) {
      el.setAttribute('inert', '')
      const active = document.activeElement
      if (active && el.contains(active)) {
        active.blur?.()
      }
    } else {
      el.removeAttribute('inert')
    }
  }, [obscured, ref])
}
