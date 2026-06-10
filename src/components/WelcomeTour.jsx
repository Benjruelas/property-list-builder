import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { TourDemoParcelPopup } from './TourDemoParcelPopup'
import { resolveTourSelector, stepUsesActionBar as usesActionBar } from './welcomeTourUtils'

const MOBILE_MAX = 767

const ALL_STEPS = [
  {
    id: 'address-search',
    title: 'Address Search',
    desc: 'Jump to any property — search an address or paste coordinates.',
    target: '.map-search-stack button',
  },
  {
    id: 'zoom',
    title: 'Zoom Controls',
    desc: 'Zoom in on parcel lines or out to scan a whole neighborhood.',
    target: '[data-tour="zoom-controls"]',
  },
  {
    id: 'recenter',
    title: 'Recenter Map',
    desc: 'One tap puts the map back on your current location.',
    target: '[data-tour="recenter"]',
  },
  {
    id: 'compass',
    title: 'Compass Mode',
    desc: 'Keep the map facing the same direction you are while you walk.',
    target: '[data-tour="compass"]',
  },
  {
    id: 'multi-select',
    title: 'Multi-Select',
    desc: 'Tag a whole street at once — select multiple parcels and add them to a list.',
    target: '[data-tour="multi-select"]',
  },
  {
    id: 'path-recording',
    title: 'Path',
    desc: 'Record your drive or walk and revisit that route anytime.',
    target: '[data-tour="path-recording"]',
    featureId: 'paths',
  },
  {
    id: 'parcel-intro',
    title: 'Parcel Quick Actions',
    desc: 'Tap any parcel for owner info and shortcuts — no full panel needed.',
    target: '[data-tour="parcel-demo-popup"]',
    parcelDemo: 'show',
    parcelLayout: 'stack',
  },
  {
    id: 'parcel-action-details',
    title: 'Details',
    desc: 'Everything on one property — owner, skip trace, hail history, and more.',
    target: '[data-tour="parcel-demo-details"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
  },
  {
    id: 'parcel-action-list',
    title: 'Add to List',
    desc: 'Save standouts to a list and highlight them on the map.',
    target: '[data-tour="parcel-demo-add-list"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
  },
  {
    id: 'parcel-action-lead',
    title: 'Convert to Lead',
    desc: 'Start tracking outreach and turn this property into a deal.',
    target: '[data-tour="parcel-demo-convert-lead"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
  },
  {
    id: 'parcel-action-photos',
    title: 'Photos',
    desc: 'Capture field photos for a lead, annotate them, and use them in photo reports.',
    target: '[data-tour="parcel-demo-photos"]',
    parcelDemo: 'show',
    tooltipPrefer: 'above',
  },
  {
    id: 'pipes',
    title: 'Pipes',
    desc: 'See every deal by stage — drag jobs through your pipeline.',
    target: '[data-tour="action-bar-pipes"]',
    mobileTarget: '[data-tour="action-bar-pipes"]',
    featureId: 'pipes',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    desc: 'Never miss a follow-up — all tasks for your leads and deals.',
    target: '[data-tour="action-bar-tasks"]',
    mobileTarget: '[data-tour="action-bar-tasks"]',
    featureId: 'tasks',
  },
  {
    id: 'schedule',
    title: 'Schedule',
    desc: 'Plan your week — appointments and due tasks in one calendar.',
    target: '[data-tour="action-bar-schedule"]',
    mobileTarget: '[data-tour="action-bar-schedule"]',
    featureId: 'schedule',
  },
  {
    id: 'navigation',
    title: 'Menu',
    desc: 'Activity, CRM tools, lists, and settings — everything beyond the action bar lives here.',
    target: '[data-tour="action-bar-menu"]',
    mobileTarget: '[data-tour="action-bar-menu"]',
    mobileTitle: 'Menu',
    mobileDesc: 'Activity, leads, photo reports, lists, and more — right from the bottom bar.',
  },
  {
    id: 'activity',
    title: 'Activity',
    desc: 'Notifications and team updates — shared lists, pipes, and mentions show up here first.',
    target: '[data-tour="menu-notifications"]',
    mobileTarget: '[data-tour="action-bar-activity"]',
    menuRequired: true,
    featureId: 'activity',
  },
  {
    id: 'leads',
    title: 'Leads',
    desc: 'Every property you\'re actively working, in one place.',
    target: '[data-tour="menu-leads"]',
    mobileTarget: '[data-tour="action-bar-leads"]',
    menuRequired: true,
    featureId: 'leads',
  },
  {
    id: 'deals',
    title: 'Deals',
    desc: 'Follow jobs from first contact through close.',
    target: '[data-tour="menu-deals"]',
    mobileTarget: '[data-tour="action-bar-deals"]',
    menuRequired: true,
    featureId: 'deals',
  },
  {
    id: 'quotes',
    title: 'Quotes',
    desc: 'Build and send quotes tied right to your deals.',
    target: '[data-tour="menu-quotes"]',
    mobileTarget: '[data-tour="action-bar-quotes"]',
    menuRequired: true,
    featureId: 'quotes',
  },
  {
    id: 'forms',
    title: 'Forms',
    desc: 'Fill PDFs in the field and email them when you\'re done.',
    target: '[data-tour="menu-forms"]',
    mobileTarget: '[data-tour="action-bar-forms"]',
    menuRequired: true,
    featureId: 'forms',
  },
  {
    id: 'photos',
    title: 'Photos',
    desc: 'Capture and annotate job-site photos — tied to leads from the map or action bar.',
    target: '[data-tour="menu-photos"]',
    mobileTarget: '[data-tour="action-bar-photos"]',
    menuRequired: true,
    featureId: 'photos',
  },
  {
    id: 'reports',
    title: 'Photo Reports',
    desc: 'Bundle lead photos into branded PDF reports — email or text a link to clients.',
    target: '[data-tour="menu-reports"]',
    mobileTarget: '[data-tour="action-bar-reports"]',
    menuRequired: true,
    featureId: 'reports',
  },
  {
    id: 'lists',
    title: 'Lists',
    desc: 'Build named lists and light up those properties on the map.',
    target: '[data-tour="menu-lists"]',
    mobileTarget: '[data-tour="action-bar-lists"]',
    menuRequired: true,
    featureId: 'lists',
  },
  {
    id: 'paths',
    title: 'Paths',
    desc: 'Review, share, or show and hide routes you\'ve recorded.',
    target: '[data-tour="menu-paths"]',
    menuRequired: true,
    featureId: 'paths',
  },
  {
    id: 'outreach',
    title: 'Outreach',
    desc: 'Saved email and text templates — reach owners without rewriting.',
    target: '[data-tour="menu-outreach"]',
    menuRequired: true,
    featureId: 'outreach',
  },
  {
    id: 'teams',
    title: 'Teams',
    desc: 'Share lists and pipelines so your crew stays in sync.',
    target: '[data-tour="menu-teams"]',
    menuRequired: true,
  },
  {
    id: 'settings-menu',
    title: 'Settings',
    desc: 'Tune the map, alerts, and how the app works for you.',
    target: '[data-tour="menu-settings"]',
    menuRequired: true,
  },
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

function isTourTargetVisible(el) {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
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

function filterSteps(steps, canAccessFeature, isMobile) {
  return steps.filter((step) => {
    if (step.desktopOnly && isMobile) return false
    if (step.mobileOnly && !isMobile) return false
    if (!step.featureId) return true
    if (!canAccessFeature) return true
    return canAccessFeature(step.featureId) !== false
  })
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
    () => filterSteps(ALL_STEPS, canAccessFeature, isMobile),
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

    const selector = resolveSelector(current, isMobile)
    if (!selector) {
      settleStep(null, true)
      return
    }

    const tryMeasure = (attempt = 0) => {
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

    const selector = resolveSelector(stepDef, isMobile)
    const isActionBarTarget = Boolean(selector?.includes('action-bar'))

    let wantMenu = false
    let wantSettings = false

    if (stepDef.settingsRequired) {
      wantSettings = true
    } else if (stepDef.menuRequired && !isActionBarTarget) {
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
  }, [step, isMobile, visibleSteps])

  useEffect(() => {
    if (!currentStepId) return
    let delay = 60
    if (current?.settingsRequired) delay = 320
    else if (current?.menuRequired) delay = 200
    else if (current?.parcelDemo === 'show') delay = 150
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
    const preferAbove = current?.tooltipPrefer === 'above'

    if (preferAbove && spaceAbove >= tt.height + TOOLTIP_GAP) {
      top = rect.top - tt.height - TOOLTIP_GAP
      left = rect.left + rect.width / 2 - tt.width / 2
    } else if (spaceLeft >= tt.width + TOOLTIP_GAP) {
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
    setTooltipPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [rect, centered, current?.parcelLayout, current?.tooltipPrefer, stepReady])

  const finish = useCallback(() => {
    if (exiting) return
    setExiting(true)
    window.setTimeout(() => {
      if (uiStateRef.current.menu) setShowMenuRef.current(false)
      if (uiStateRef.current.settings) setSettingsOpenRef.current?.(false)
      uiStateRef.current = { menu: false, settings: false }
      onComplete()
    }, 380)
  }, [exiting, onComplete])

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
    document.body
  )
}
