import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

const STEPS = [
  // Left side of screen
  { target: '.map-search-stack button',     title: 'Address Search',      desc: 'Search for any address or paste coordinates to jump there', menuRequired: false },
  { target: '.maplibregl-ctrl-zoom-in',      title: 'Zoom Controls',       desc: 'Zoom in and out of the map', menuRequired: false },
  { target: '.north-indicator',             title: 'North Indicator',     desc: 'Shows which direction is geographic North — rotates as the map rotates', menuRequired: false },
  // Right side of screen
  { target: '[data-tour="recenter"]',       title: 'Recenter Map',        desc: 'Tap to snap the map back to your current location', menuRequired: false },
  { target: '[data-tour="compass"]',        title: 'Compass Mode',        desc: 'Rotates the map to match the direction you are facing', menuRequired: false },
  { target: '[data-tour="multi-select"]',   title: 'Multi-Select',        desc: 'Select multiple parcels at once to add them to a list', menuRequired: false },
  { target: '[data-tour="path-recording"]', title: 'Record a Path',       desc: 'Track your route as you drive or walk a neighborhood', menuRequired: false },
  { target: '[data-tour="menu"]',           title: 'Menu',                desc: 'Access all features from here', menuRequired: false },
  // Menu items
  { target: '[data-tour="menu-lists"]',           title: 'Lists',               desc: 'Create and manage property lists', menuRequired: true },
  { target: '[data-tour="menu-paths"]',           title: 'Paths',               desc: 'View and manage your recorded routes', menuRequired: true },
  { target: '[data-tour="menu-outreach"]',         title: 'Outreach',            desc: 'Create and manage email & text message templates for outreach', menuRequired: true },
  { target: '[data-tour="menu-pipeline"]',        title: 'Pipes',               desc: 'Track leads through your deal stages', menuRequired: true },
  { target: '[data-tour="menu-contacts"]',       title: 'Contacts',            desc: 'See leads and, soon, clients', menuRequired: true },
  { target: '[data-tour="menu-tasks"]',           title: 'Tasks',               desc: 'Manage tasks assigned to leads', menuRequired: true },
  { target: '[data-tour="menu-schedule"]',        title: 'Schedule',            desc: 'Calendar view of your upcoming tasks', menuRequired: true },
  { target: '[data-tour="menu-settings"]',        title: 'Settings',            desc: 'Customize map style, notifications, and more', menuRequired: true },
  { target: '[data-tour="settings-skip-traced-section"]', title: 'Skip Traced Parcels', desc: 'In Settings, expand this section to open the list of parcels with contact info from skip tracing', menuRequired: false, settingsRequired: true },
]

const PADDING = 8
const TOOLTIP_GAP = 12

function getRect(el) {
  const r = el.getBoundingClientRect()
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
    right: r.right + PADDING,
    bottom: r.bottom + PADDING,
  }
}

export default function WelcomeTour({ onComplete, setShowMenu, setSettingsOpen }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const tooltipRef = useRef(null)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })

  const current = STEPS[step]

  const measureTarget = useCallback(() => {
    const el = document.querySelector(current.target)
    if (!el) return
    setRect(getRect(el))
  }, [current.target])

  useEffect(() => {
    if (current.settingsRequired) {
      setShowMenu(false)
      setSettingsOpen?.(true)
    } else if (current.menuRequired) {
      setShowMenu(true)
    } else if (step < STEPS.length && !current.menuRequired) {
      setShowMenu(false)
    }
  }, [step, current.menuRequired, current.settingsRequired, setShowMenu, setSettingsOpen])

  useEffect(() => {
    const delay = current.settingsRequired ? 280 : 60
    const timer = setTimeout(measureTarget, delay)
    return () => clearTimeout(timer)
  }, [measureTarget, step, current.settingsRequired])

  useEffect(() => {
    const onResize = () => measureTarget()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [measureTarget])

  useEffect(() => {
    if (!rect || !tooltipRef.current) return
    const tt = tooltipRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let top, left

    const spaceBelow = vh - rect.bottom
    const spaceAbove = rect.top
    const spaceLeft = rect.left
    const spaceRight = vw - rect.right

    if (spaceLeft >= tt.width + TOOLTIP_GAP) {
      left = rect.left - tt.width - TOOLTIP_GAP
      top = rect.top + rect.height / 2 - tt.height / 2
    } else if (spaceBelow >= tt.height + TOOLTIP_GAP) {
      top = rect.bottom + TOOLTIP_GAP
      left = rect.left + rect.width / 2 - tt.width / 2
    } else if (spaceAbove >= tt.height + TOOLTIP_GAP) {
      top = rect.top - tt.height - TOOLTIP_GAP
      left = rect.left + rect.width / 2 - tt.width / 2
    } else if (spaceRight >= tt.width + TOOLTIP_GAP) {
      left = rect.right + TOOLTIP_GAP
      top = rect.top + rect.height / 2 - tt.height / 2
    } else {
      top = vh / 2 - tt.height / 2
      left = vw / 2 - tt.width / 2
    }

    top = Math.max(12, Math.min(vh - tt.height - 12, top))
    left = Math.max(12, Math.min(vw - tt.width - 12, left))
    setTooltipPos({ top, left })
  }, [rect])

  const finish = useCallback(() => {
    setShowMenu(false)
    setSettingsOpen?.(false)
    onComplete()
  }, [onComplete, setShowMenu, setSettingsOpen])

  const handleNext = useCallback(() => {
    if (step >= STEPS.length - 1) {
      finish()
    } else {
      setStep(s => s + 1)
    }
  }, [step, finish])

  if (!rect) {
    return createPortal(
      <div className="tour-overlay" />,
      document.body
    )
  }

  return createPortal(
    <>
      {/* Click-catcher behind spotlight — advances tour when user taps the dim area */}
      <div className="tour-overlay" onClick={handleNext} />
      {/* Spotlight — box-shadow dims everything outside, element is clearly visible */}
      <div
        className="tour-spotlight"
        onClick={handleNext}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />
      <div
        ref={tooltipRef}
        className="tour-tooltip"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className="tour-tooltip-counter">
          {step + 1} of {STEPS.length}
        </div>
        <div className="tour-tooltip-title">{current.title}</div>
        <div className="tour-tooltip-desc">{current.desc}</div>
        <div className="tour-tooltip-actions">
          <button className="tour-tooltip-btn" onClick={handleNext}>
            {step >= STEPS.length - 1 ? 'Done' : 'Next'}
          </button>
          <button className="tour-tooltip-skip" onClick={finish}>
            Skip Tour
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
