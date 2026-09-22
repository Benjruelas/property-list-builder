/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MobileActionBar } from '../MobileActionBar'

const BAR_IDS = ['leads', 'tasks', 'schedule', 'menu']
const OVERFLOW = []

vi.mock('@/hooks/useActionBarLayout', () => ({
  useActionBarLayout: () => ({
    barIds: BAR_IDS,
    overflowPrimaryIds: OVERFLOW,
    isDesktop: false,
  }),
}))

vi.mock('@/utils/panelChunks', () => ({
  prefetchPanel: vi.fn(),
}))

vi.mock('../ActionBarMenu', () => ({
  ActionBarMenu: () => null,
}))

describe('MobileActionBar keyboard / search fade', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  it('fades and disables interaction when faded is true', () => {
    const { container } = render(
      <MobileActionBar faded setShowMenu={vi.fn()} />,
    )
    const nav = container.querySelector('.mobile-action-bar')
    expect(nav.classList.contains('mobile-action-bar--faded')).toBe(true)
    expect(nav.getAttribute('aria-hidden')).toBe('true')
    const buttons = screen.getAllByRole('button', { hidden: true })
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((btn) => {
      expect(btn.getAttribute('tabIndex')).toBe('-1')
    })
  })

  it('closes the menu when fading begins', () => {
    const setShowMenu = vi.fn()
    const { rerender } = render(
      <MobileActionBar showMenu={false} setShowMenu={setShowMenu} />,
    )
    expect(setShowMenu).not.toHaveBeenCalled()
    rerender(<MobileActionBar showMenu faded setShowMenu={setShowMenu} />)
    expect(setShowMenu).toHaveBeenCalledWith(false)
  })
})
