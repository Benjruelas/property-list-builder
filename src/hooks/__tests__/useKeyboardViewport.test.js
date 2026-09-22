/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardViewport } from '../useKeyboardViewport'

describe('useKeyboardViewport', () => {
  let listeners

  beforeEach(() => {
    listeners = {}
    document.documentElement.style.removeProperty('--keyboard-inset')
    document.documentElement.removeAttribute('data-keyboard-open')

    const vv = {
      height: 800,
      offsetTop: 0,
      addEventListener: vi.fn((type, fn) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(fn)
      }),
      removeEventListener: vi.fn((type, fn) => {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn)
      }),
    }
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: vv,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    })
  })

  afterEach(() => {
    document.documentElement.style.removeProperty('--keyboard-inset')
    document.documentElement.removeAttribute('data-keyboard-open')
  })

  it('sets keyboard inset and data-keyboard-open when visual viewport shrinks', () => {
    renderHook(() => useKeyboardViewport())
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px')
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false)

    act(() => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
      window.visualViewport.height = 400
      window.visualViewport.offsetTop = 0
      listeners.resize?.forEach((fn) => fn())
    })

    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('400px')
    expect(document.documentElement.getAttribute('data-keyboard-open')).toBe('1')
  })

  it('clears data-keyboard-open when inset drops below threshold', () => {
    renderHook(() => useKeyboardViewport())

    act(() => {
      window.visualViewport.height = 400
      listeners.resize?.forEach((fn) => fn())
    })
    expect(document.documentElement.getAttribute('data-keyboard-open')).toBe('1')

    act(() => {
      window.visualViewport.height = 780
      listeners.resize?.forEach((fn) => fn())
    })
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('20px')
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false)
  })
})
