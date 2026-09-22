import { useEffect } from 'react'

/**
 * Keep the app shell height stable when the iOS keyboard opens, and expose
 * keyboard overlap so fixed chrome (action bar) can stay put / hide.
 *
 * On iOS Safari the visual viewport shrinks while the layout viewport often
 * stays tall — fixed `bottom: 0` docks ride up with the keyboard. On Capacitor
 * with resize=none the same visualViewport gap appears. We publish:
 *   --keyboard-inset  → px of overlap (for optional translate)
 *   data-keyboard-open → "1" when inset is meaningful
 */
const KEYBOARD_OPEN_PX = 80

export function useKeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement

    const update = () => {
      const vv = window.visualViewport
      if (!vv) {
        root.style.setProperty('--keyboard-inset', '0px')
        root.removeAttribute('data-keyboard-open')
        return
      }
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      root.style.setProperty('--keyboard-inset', `${inset}px`)
      if (inset >= KEYBOARD_OPEN_PX) {
        root.setAttribute('data-keyboard-open', '1')
      } else {
        root.removeAttribute('data-keyboard-open')
      }
    }

    update()
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      root.style.setProperty('--keyboard-inset', '0px')
      root.removeAttribute('data-keyboard-open')
    }
  }, [])
}
