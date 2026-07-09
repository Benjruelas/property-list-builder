import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCachedStormTimeline,
  hailEventTimelineKey,
  radarAvailableForEvent,
  resolveStormTimeline,
} from '../utils/nexradOverlay'

function applyTimelineFrames(frames, setFrames, setFrameIndex) {
  setFrames(frames)
  // Always open at the start of the lookback window (progress at 0).
  setFrameIndex(0)
}

export function useHailStormTimeline(event) {
  const [frames, setFrames] = useState([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const eventKey = hailEventTimelineKey(event)

  useEffect(() => {
    if (!event || !radarAvailableForEvent(event)) {
      setFrames([])
      setFrameIndex(0)
      setLoading(false)
      return
    }

    const cached = getCachedStormTimeline(event)
    if (cached?.length) {
      applyTimelineFrames(cached, setFrames, setFrameIndex)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    resolveStormTimeline(event)
      .then((resolved) => {
        if (cancelled) return
        applyTimelineFrames(resolved, setFrames, setFrameIndex)
      })
      .catch(() => {
        if (!cancelled) {
          setFrames([])
          setFrameIndex(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [eventKey])

  const current = frames[frameIndex] ?? null
  const canPrev = frameIndex > 0
  const canNext = frameIndex < frames.length - 1

  const stepPrev = useCallback(() => {
    setFrameIndex((i) => Math.max(0, i - 1))
  }, [])

  const stepNext = useCallback(() => {
    setFrameIndex((i) => Math.min(frames.length - 1, i + 1))
  }, [frames.length])

  const goToReportFrame = useCallback(() => {
    const reportIdx = frames.findIndex((f) => f.offsetHours === 0)
    if (reportIdx >= 0) setFrameIndex(reportIdx)
  }, [frames])

  return useMemo(() => ({
    frames,
    frameIndex,
    frameCount: frames.length,
    frameLabel: current?.label ?? '',
    tileUrl: current?.tileUrl ?? null,
    hasRadarData: !!current?.tileUrl,
    loading,
    canStep: frames.length > 1,
    canPrev,
    canNext,
    stepPrev,
    stepNext,
    goToReportFrame,
    isReportFrame: current?.offsetHours === 0,
  }), [
    frames,
    frameIndex,
    current,
    loading,
    canPrev,
    canNext,
    stepPrev,
    stepNext,
    goToReportFrame,
  ])
}

export default useHailStormTimeline
