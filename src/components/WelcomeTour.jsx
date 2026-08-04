import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { TourDemoParcelPopup } from './TourDemoParcelPopup'
import {
  resolveTourSelector,
  stepUsesActionBar as usesActionBar,
  alignSideTooltipWithSpotlightTop,
} from './welcomeTourUtils'
import { getModalPortalContainer } from '@/utils/modalPortal'

const MOBILE_MAX = 767

/** Map chrome → parcel demo → compact bar L→R → Menu → overflow T→B → teams. */
const DESKTOP_TOUR_ORDER = [
  'address-search',
  'multi-select',
  'path-recording',
  'recenter',
  'compass',
  'photo-mode',
  'parcel-intro',
  'parcel-action-details',
  'parcel-action-list',
  'parcel-action-lead',
  'parcel-action-photos',
  'leads',
  'tasks',
  'schedule',
  'activity',
  'navigation',
  'pipes',
  'deals',
  'quotes',
  'forms',
  'reports',
  'lists',
  'paths',
  'outreach',
  'settings-menu',
  'teams',
]

const MOBILE_TOUR_ORDER = [
  'address-search',
  'multi-select',
  'path-recording',
  'recenter',
  'compass',
  'photo-mode',
  'parcel-intro',
  'parcel-action-details',
  'parcel-action-list',
  'parcel-action-lead',
  'parcel-action-photos',
  'leads',
  'tasks',
  'schedule',
  'navigation',
  'activity',
  'pipes',
  'deals',
  'quotes',
  'forms',
  'reports',
  'lists',
  'paths',
  'outreach',
  'settings-menu',
  'teams',
]

const TOUR_STEPS_BY_ID = {
  'address-search': {
    id: 'address-search',
    title: 'Search',
    desc: 'Search leads or an address — open a lead, or jump the map to a property.',
    target: '[data-tour="address-search"]',
    tooltipPrefer: 'right',
  },
  recenter: {
    id: 'recenter',
    title: 'Recenter Map',
    desc: 'One tap puts the map back on your current location.',
    target: '[data-tour="recenter"]',
    tooltipPrefer: 'left',
  },
  compass: {
    id: 'compass',
    title: 'Compass',
    desc: 'Orient the map to face the direction you\'re walking.',
    target: '[data-tour="compass"]',
    tooltipPrefer: 'left',
  },
  'photo-mode': {
    id: 'photo-mode',
    title: 'Photo Mode',
    desc: 'Find this property and start shooting — geolocate, open the camera, and save photos to a lead.',
    target: '[data-tour="photo-mode"]',
    featureId: 'photos',
    tooltipPrefer: 'left',
  },
  'multi-select': {
    id: 'multi-select',
    title: 'Multi-Select',
    desc: 'Tag a whole street at once — select parcels, then add them to a list.',
    target: '[data-tour="multi-select"]',
    tooltipPrefer: 'right',
  },
  'path-recording': {
    id: 'path-recording',
    title: 'Path',
    desc: 'Tap to record your drive or walk, then stop to save the route.',
    target: '[data-tour="path-recording"]',
    featureId: 'paths',
    tooltipPrefer: 'right',
  },
  'parcel-intro': {
    id: 'parcel-intro',
    title: 'Parcel Quick Actions',
    desc: 'Tap any parcel for owner info and shortcuts — no full panel needed.',
    target: '[data-tour="parcel-demo-popup"]',
    parcelDemo: 'show',
    parcelLayout: 'stack',
  },
  'parcel-action-details': {
    id: 'parcel-action-details',
    title: 'Details',
    desc: 'Open the full property sheet — owner, skip trace, hail history, and more.',
    target: '[data-tour="parcel-demo-details"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
  },
  'parcel-action-list': {
    id: 'parcel-action-list',
    title: 'Add to List',
    desc: 'Save standouts to a list and highlight them on the map.',
    target: '[data-tour="parcel-demo-add-list"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
    featureId: 'lists',
  },
  'parcel-action-lead': {
    id: 'parcel-action-lead',
    title: 'Create Lead',
    desc: 'Create a lead for this property — owner and address are prefilled for you.',
    target: '[data-tour="parcel-demo-convert-lead"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
    featureId: 'leads',
  },
  'parcel-action-photos': {
    id: 'parcel-action-photos',
    title: 'Photos',
    desc: 'Capture field photos for a lead, annotate them, and use them in reports.',
    target: '[data-tour="parcel-demo-photos"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
    featureId: 'photos',
  },
  pipes: {
    id: 'pipes',
    title: 'Pipes',
    desc: 'Track momentum visually — leads and deals sorted by stage, drag to move them forward.',
    target: '[data-tour="action-bar-pipes"]',
    mobileTarget: '[data-tour="menu-pipes"]',
    menuRequired: true,
    featureId: 'pipes',
  },
  tasks: {
    id: 'tasks',
    title: 'Tasks',
    desc: 'See what\'s due next — tasks on leads, deals, and anything else you\'re tracking, sorted so nothing slips.',
    target: '[data-tour="action-bar-tasks"]',
    mobileTarget: '[data-tour="action-bar-tasks"]',
    featureId: 'tasks',
  },
  schedule: {
    id: 'schedule',
    title: 'Schedule',
    desc: 'Plan your week — appointments and due tasks in one calendar.',
    target: '[data-tour="action-bar-schedule"]',
    mobileTarget: '[data-tour="action-bar-schedule"]',
    featureId: 'schedule',
  },
  navigation: {
    id: 'navigation',
    title: 'Menu',
    desc: 'CRM, Documents, and Tools — anything not on the action bar lives here.',
    target: '[data-tour="action-bar-menu"]',
    mobileTarget: '[data-tour="action-bar-menu"]',
    mobileTitle: 'Menu',
    mobileDesc: 'Activity, CRM, Documents, Tools, and Settings — right from the bottom bar.',
  },
  activity: {
    id: 'activity',
    title: 'Activity',
    desc: 'Notifications and team updates — shared work and mentions show up here first.',
    target: '[data-tour="action-bar-activity"]',
    mobileTarget: '[data-tour="menu-notifications"]',
    menuRequired: true,
    featureId: 'activity',
  },
  leads: {
    id: 'leads',
    title: 'Leads',
    desc: 'See every lead you\'re working — check status, log updates, or fly back to the property on the map.',
    target: '[data-tour="action-bar-leads"]',
    mobileTarget: '[data-tour="action-bar-leads"]',
    featureId: 'leads',
  },
  deals: {
    id: 'deals',
    title: 'Deals',
    desc: 'Business with a lead lives here — open a deal to manage stage, finances, quotes, and tasks on your pipe.',
    target: '[data-tour="action-bar-deals"]',
    mobileTarget: '[data-tour="menu-deals"]',
    menuRequired: true,
    featureId: 'deals',
  },
  quotes: {
    id: 'quotes',
    title: 'Quotes',
    desc: 'Build and send quotes — clients get a share link to review, accept, pay, and download a PDF.',
    target: '[data-tour="action-bar-quotes"]',
    mobileTarget: '[data-tour="menu-quotes"]',
    menuRequired: true,
    featureId: 'quotes',
  },
  forms: {
    id: 'forms',
    title: 'Forms',
    desc: 'Fill out forms, then finish in person or send a link. Both of you get a copy.',
    target: '[data-tour="action-bar-forms"]',
    mobileTarget: '[data-tour="menu-forms"]',
    menuRequired: true,
    featureId: 'forms',
  },
  reports: {
    id: 'reports',
    title: 'Reports',
    desc: 'Turn lead photos into branded reports — email or text a link so clients can view and download a PDF.',
    target: '[data-tour="action-bar-reports"]',
    mobileTarget: '[data-tour="menu-reports"]',
    menuRequired: true,
    featureId: 'reports',
  },
  lists: {
    id: 'lists',
    title: 'Lists',
    desc: 'Build named lists and light up those properties on the map.',
    target: '[data-tour="action-bar-lists"]',
    mobileTarget: '[data-tour="menu-lists"]',
    menuRequired: true,
    featureId: 'lists',
  },
  paths: {
    id: 'paths',
    title: 'Paths',
    desc: 'Review, share, or show and hide routes you\'ve recorded.',
    target: '[data-tour="action-bar-paths"]',
    mobileTarget: '[data-tour="menu-paths"]',
    menuRequired: true,
    featureId: 'paths',
  },
  outreach: {
    id: 'outreach',
    title: 'Outreach',
    desc: 'Saved email and text templates — reach owners without rewriting.',
    target: '[data-tour="action-bar-outreach"]',
    mobileTarget: '[data-tour="menu-outreach"]',
    menuRequired: true,
    featureId: 'outreach',
  },
  'settings-menu': {
    id: 'settings-menu',
    title: 'Settings',
    desc: 'Profile, team, map, appearance, notifications, and data — each section expands when you tap it.',
    target: '[data-tour="menu-settings"]',
    mobileTarget: '[data-tour="menu-settings"]',
    menuRequired: true,
  },
  teams: {
    id: 'teams',
    title: 'Team',
    desc: 'Create a team, invite members, and customize lead statuses from team settings.',
    target: '[data-tour="settings-team-section"]',
    settingsRequired: true,
    expandSettingsSection: 'team',
  },
}

const PADDING = 8
const TOOLTIP_GAP = 12

function rectFromPoints(top, left, width, height) {
  return {
    top: top - PADDING,
    left: left - PADDING,
    width: width + PADDING * 2,
    height: height + PADDING * 2,
    right: left + width + PADDING,
    bottom: top + height + PADDING,
  }
}

function getRect(el) {
  const r = el.getBoundingClientRect()
  if (r.width >= 1 && r.height >= 1) {
    return rectFromPoints(r.top, r.left, r.width, r.height)
  }

  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const child of el.children) {
    const cr = child.getBoundingClientRect()
    if (cr.width < 1 || cr.height < 1) continue
    top = Math.min(top, cr.top)
    left = Math.min(left, cr.left)
    right = Math.max(right, cr.right)
    bottom = Math.max(bottom, cr.bottom)
  }
  if (!Number.isFinite(top)) {
    return rectFromPoints(r.top, r.left, Math.max(r.width, 0), Math.max(r.height, 0))
  }
  return rectFromPoints(top, left, right - left, bottom - top)
}

function isTourTargetVisible(el) {
  const r = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false

  if (r.width >= 1 && r.height >= 1) return true

  for (const child of el.children) {
    if (isTourTargetVisible(child)) return true
  }
  return false
}

/** Prefer the visible match — desktop and mobile both render duplicate menu targets. */
function findTourTarget(selector) {
  const nodes = document.querySelectorAll(selector)
  for (const el of nodes) {
    if (isTourTargetVisible(el)) return el
  }
  return null
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMobile
}

function filterSteps(steps, canAccessFeature) {
  return steps.filter((step) => {
    if (!step.featureId) return true
    if (!canAccessFeature) return true
    return canAccessFeature(step.featureId) !== false
  })
}

function buildVisibleSteps(isMobile, canAccessFeature) {
  const order = isMobile ? MOBILE_TOUR_ORDER : DESKTOP_TOUR_ORDER
  const steps = order.map((id) => TOUR_STEPS_BY_ID[id]).filter(Boolean)
  return filterSteps(steps, canAccessFeature)
}

export {
  DESKTOP_TOUR_ORDER,
  MOBILE_TOUR_ORDER,
  TOUR_STEPS_BY_ID,
  buildVisibleSteps,
}

function resolveSelector(step, isMobile) {
  return resolveTourSelector(step, isMobile, findTourTarget)
}

function stepDisplay(step, isMobile) {
  if (isMobile && step.mobileTitle) {
    return { title: step.mobileTitle, desc: step.mobileDesc || step.desc }
  }
  return { title: step.title, desc: step.desc }
}

/** Layout jumps when tooltip keeps a stale anchor (e.g. parcel demo → menu). */
function isMajorTourTransition(prev, next, isMobile) {
  if (!prev || !next) return false
  if (prev.parcelDemo === 'show' && next.parcelDemo !== 'show') return true
  if (prev.parcelDemo !== 'show' && next.parcelDemo === 'show') return true
  if (prev.parcelLayout === 'stack' || next.parcelLayout === 'stack') {
    if (prev.parcelLayout !== next.parcelLayout) return true
  }
  if (prev.menuRequired && !next.menuRequired && !next.parcelDemo) return true
  if (
    next.menuRequired &&
    !usesActionBar(next, isMobile, findTourTarget) &&
    !prev.menuRequired &&
    !prev.parcelLayout
  ) {
    return true
  }
  return false
}

export default function WelcomeTour({
  onComplete,
  onStepChange,
  setShowMenu,
  setSettingsOpen,
  canAccessFeature,
  showMenu = false,
}) {
  const isMobile = useIsMobile()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const [centered, setCentered] = useState(false)
  const [stepReady, setStepReady] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [parcelDemoMounted, setParcelDemoMounted] = useState(false)
  const [parcelDemoExiting, setParcelDemoExiting] = useState(false)
  const [layoutTransition, setLayoutTransition] = useState(false)
  const tooltipRef = useRef(null)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const lastSpotlightRectRef = useRef(null)
  const prevStepRef = useRef(null)
  const setShowMenuRef = useRef(setShowMenu)
  const setSettingsOpenRef = useRef(setSettingsOpen)
  const uiStateRef = useRef({ menu: false, settings: false })

  setShowMenuRef.current = setShowMenu
  setSettingsOpenRef.current = setSettingsOpen

  const visibleSteps = useMemo(
    () => buildVisibleSteps(isMobile, canAccessFeature),
    [canAccessFeature, isMobile]
  )

  const current = visibleSteps[step] || visibleSteps[0]
  const currentStepId = current?.id
  const isLastStep = visibleSteps.length > 0 && step >= visibleSteps.length - 1

  const settleStep = useCallback((nextRect, nextCentered) => {
    if (nextRect) lastSpotlightRectRef.current = nextRect
    setCentered(nextCentered)
    setRect(nextRect)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setStepReady(true)
        setLayoutTransition(false)
      })
    })
  }, [])

  const measureTarget = useCallback(() => {
    if (!currentStepId || !current) return

    if (current.centered) {
      settleStep(null, true)
      return
    }

    const tryMeasure = (attempt = 0) => {
      // Re-resolve each attempt so a late-opening menu can switch from a
      // missing bar selector to the visible menu-* target.
      const selector = resolveSelector(current, isMobile)
      if (!selector) {
        settleStep(null, true)
        return
      }

      const el = findTourTarget(selector)
      if (el) {
        settleStep(getRect(el), false)
        return
      }
      if (attempt < 6) {
        const delay = attempt === 0 ? 60 : 120
        requestAnimationFrame(() => {
          setTimeout(() => tryMeasure(attempt + 1), delay)
        })
        return
      }
      settleStep(null, true)
    }

    tryMeasure()
  }, [current, currentStepId, isMobile, settleStep])

  useEffect(() => {
    const prev = prevStepRef.current
    const major = isMajorTourTransition(prev, current, isMobile)
    if (major) {
      setLayoutTransition(true)
      setStepReady(false)
      setRect(null)
    }
    prevStepRef.current = current
  }, [step, currentStepId, current, isMobile])

  useEffect(() => {
    if (current?.parcelDemo === 'show') {
      setParcelDemoExiting(false)
      setParcelDemoMounted(true)
      return
    }
    if (!parcelDemoMounted) return
    setParcelDemoExiting(true)
    const timer = window.setTimeout(() => {
      setParcelDemoMounted(false)
      setParcelDemoExiting(false)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [current?.parcelDemo, parcelDemoMounted])

  useEffect(() => {
    const stepDef = visibleSteps[step]
    if (!stepDef) return

    onStepChange?.(stepDef.id, stepDef.expandSettingsSection ?? null)

    const selector = resolveSelector(stepDef, isMobile)
    const barTargetVisible = stepDef.target ? findTourTarget(stepDef.target) : null

    let wantMenu = false
    let wantSettings = false

    if (stepDef.settingsRequired) {
      wantSettings = true
    } else if (stepDef.menuRequired && !barTargetVisible) {
      wantMenu = true
    }

    const prev = uiStateRef.current
    if (wantMenu !== prev.menu) {
      setShowMenuRef.current(wantMenu)
      uiStateRef.current = { ...uiStateRef.current, menu: wantMenu }
    }
    if (wantSettings !== prev.settings) {
      setSettingsOpenRef.current?.(wantSettings)
      uiStateRef.current = { ...uiStateRef.current, settings: wantSettings }
    }
  }, [step, isMobile, visibleSteps, onStepChange])

  useEffect(() => {
    if (!currentStepId) return
    let delay = 60
    if (current?.settingsRequired) {
      // Settings panel mount + optional section expand before measure.
      delay = current?.expandSettingsSection ? 380 : 320
    } else if (current?.menuRequired) {
      // Wait for overflow menu open/anchor before measuring menu-* rows.
      delay = showMenu ? 200 : 240
    } else if (current?.parcelDemo === 'show') {
      delay = 150
    }
    const timer = setTimeout(measureTarget, delay)
    return () => clearTimeout(timer)
  }, [measureTarget, step, currentStepId, current, showMenu])

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
    if (!stepReady || centered || !rect || !tooltipRef.current || current?.parcelLayout === 'stack') {
      return
    }
    const tt = tooltipRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let top, left

    const spaceBelow = vh - rect.bottom
    const spaceAbove = rect.top
    const spaceLeft = rect.left
    const spaceRight = vw - rect.right
    const selector = resolveSelector(current, isMobile)
    const preferAbove =
      current?.tooltipPrefer === 'above' ||
      selector?.includes('action-bar') ||
      selector?.includes('menu-')
    const preferRight = current?.tooltipPrefer === 'right'
    const preferLeft = current?.tooltipPrefer === 'left'

    let placedBeside = false
    if (preferAbove && spaceAbove >= tt.height + TOOLTIP_GAP) {
      top = rect.top - tt.height - TOOLTIP_GAP
      left = rect.left + rect.width / 2 - tt.width / 2
    } else if (preferRight && spaceRight >= tt.width + TOOLTIP_GAP) {
      left = rect.right + TOOLTIP_GAP
      top = rect.top + rect.height / 2 - tt.height / 2
      placedBeside = true
    } else if (preferLeft && spaceLeft >= tt.width + TOOLTIP_GAP) {
      left = rect.left - tt.width - TOOLTIP_GAP
      top = rect.top + rect.height / 2 - tt.height / 2
      placedBeside = true
    } else if (spaceLeft >= tt.width + TOOLTIP_GAP) {
      left = rect.left - tt.width - TOOLTIP_GAP
      top = rect.top + rect.height / 2 - tt.height / 2
      placedBeside = true
    } else if (spaceBelow >= tt.height + TOOLTIP_GAP) {
      top = rect.bottom + TOOLTIP_GAP
      left = rect.left + rect.width / 2 - tt.width / 2
    } else if (spaceAbove >= tt.height + TOOLTIP_GAP) {
      top = rect.top - tt.height - TOOLTIP_GAP
      left = rect.left + rect.width / 2 - tt.width / 2
    } else if (spaceRight >= tt.width + TOOLTIP_GAP) {
      left = rect.right + TOOLTIP_GAP
      top = rect.top + rect.height / 2 - tt.height / 2
      placedBeside = true
    } else {
      top = vh / 2 - tt.height / 2
      left = vw / 2 - tt.width / 2
    }

    const actionBarReserve = 96
    top = Math.max(12, Math.min(vh - tt.height - 12, top))
    if (preferAbove || selector?.includes('action-bar')) {
      top = Math.min(top, vh - actionBarReserve - tt.height - 12)
    }
    // Top map-chrome steps on iPhone: after viewport clamp, keep the card from
    // riding into the status bar by lining its top with the spotlight top.
    top = alignSideTooltipWithSpotlightTop({
      top,
      spotlightTop: rect.top,
      placedBeside,
    })
    left = Math.max(12, Math.min(vw - tt.width - 12, left))
    setTooltipPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [rect, centered, current, current?.parcelLayout, current?.tooltipPrefer, isMobile, stepReady])

  const finish = useCallback(() => {
    if (exiting) return
    setExiting(true)
    window.setTimeout(() => {
      if (uiStateRef.current.menu) setShowMenuRef.current(false)
      if (uiStateRef.current.settings) setSettingsOpenRef.current?.(false)
      uiStateRef.current = { menu: false, settings: false }
      onStepChange?.(null, null)
      onComplete()
    }, 380)
  }, [exiting, onComplete, onStepChange])

  const handleNext = useCallback(() => {
    if (exiting) return
    if (isLastStep) {
      finish()
      return
    }
    setStep((s) => s + 1)
  }, [isLastStep, finish, exiting])

  if (!current || visibleSteps.length === 0) {
    return null
  }

  const { title, desc } = stepDisplay(current, isMobile)
  const isParcelStack = current?.parcelLayout === 'stack'
  const showParcelDemo = parcelDemoMounted
  const showTooltip = isParcelStack || centered || rect || !stepReady
  const spotlightRect = rect && !centered ? rect : lastSpotlightRectRef.current
  const showSpotlight = Boolean(spotlightRect && !centered)
  const tooltipCanAnimate = stepReady && !parcelDemoExiting && !layoutTransition

  const tooltipBody = (
    <div key={currentStepId} className="tour-tooltip-content">
      <div className="tour-tooltip-counter">
        {step + 1} of {visibleSteps.length}
      </div>
      <div className="tour-tooltip-title">{title}</div>
      <div className="tour-tooltip-desc">{desc}</div>
      <div className="tour-tooltip-actions">
        <button type="button" className="tour-tooltip-btn" onClick={handleNext}>
          {isLastStep ? 'Done' : 'Next'}
        </button>
        <button type="button" className="tour-tooltip-skip" onClick={finish}>
          Skip Tour
        </button>
      </div>
    </div>
  )

  const tooltipClassName = [
    'tour-tooltip',
    centered && 'tour-tooltip--centered',
    tooltipCanAnimate && 'tour-tooltip--ready',
    !tooltipCanAnimate && 'tour-tooltip--pending',
  ]
    .filter(Boolean)
    .join(' ')

  return createPortal(
    <div className={exiting ? 'tour-shell tour-shell--exiting' : 'tour-shell tour-shell--enter'}>
      <div className="tour-overlay" onClick={handleNext} />
      {showSpotlight && spotlightRect && (
        <div
          className="tour-spotlight tour-spotlight--visible"
          onClick={handleNext}
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}
      {showParcelDemo && (
        <div
          className={
            parcelDemoExiting
              ? 'tour-demo-parcel-anchor tour-demo-parcel-anchor--exit'
              : 'tour-demo-parcel-anchor tour-demo-parcel-anchor--enter'
          }
        >
          <TourDemoParcelPopup />
        </div>
      )}
      {isParcelStack && showTooltip && (
        <div className="tour-parcel-intro-stack tour-parcel-intro-stack--enter">
          <div ref={tooltipRef} className={`${tooltipClassName} tour-tooltip--in-stack`}>
            {tooltipBody}
          </div>
        </div>
      )}
      {showTooltip && !isParcelStack && (
        <div
          ref={tooltipRef}
          className={tooltipClassName}
          style={centered ? undefined : { top: tooltipPos.top, left: tooltipPos.left }}
        >
          {tooltipBody}
        </div>
      )}
    </div>,
    getModalPortalContainer() || document.body
  )
}
