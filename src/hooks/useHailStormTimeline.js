import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCachedStormTimeline,
  hailEventTimelineKey,
  initialStormFrameIndex,
  radarAvailableForEvent,
  resolveStormTimeline,
} from '../utils/nexradOverlay'

function applyTimelineFrames(frames, setFrames, setFrameIndex) {
  setFrames(frames)
  setFrameIndex(initialStormFrameIndex(frames))
}

function nearestFrameWithTiles(frames, fromIndex, direction) {
  if (!frames?.length) return fromIndex
  const step = direction < 0 ? -1 : 1
  for (let j = fromIndex + step; j >= 0 && j < frames.length; j += step) {
    if (frames[j]?.tileUrl) return j
  }
  return Math.max(0, Math.min(frames.length - 1, fromIndex + step))
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
    setFrameIndex((i) => nearestFrameWithTiles(frames, i, -1))
  }, [frames])

  const stepNext = useCallback(() => {
    setFrameIndex((i) => nearestFrameWithTiles(frames, i, 1))
  }, [frames])

  const goToFrame = useCallback((index) => {
    if (!frames.length) return
    const clamped = Math.max(0, Math.min(frames.length - 1, Math.round(index)))
    setFrameIndex(clamped)
  }, [frames.length])

  const goToReportFrame = useCallback(() => {
    setFrameIndex(initialStormFrameIndex(frames))
  }, [frames])

  return useMemo(() => ({
    frames,
    frameIndex,
    frameCount: frames.length,
    frameLabel: current?.label ?? '',
    tileUrl: current?.tileUrl ?? null,
    radarId: current?.radarId ?? null,
    radarName: current?.radarName ?? null,
    hasRadarData: !!current?.tileUrl,
    loading,
    canStep: frames.length > 1,
    canPrev,
    canNext,
    stepPrev,
    stepNext,
    goToFrame,
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
    goToFrame,
    goToReportFrame,
  ])
}

export default useHailStormTimeline
