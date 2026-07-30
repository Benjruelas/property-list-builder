import { useState, useEffect, useRef, useMemo } from 'react'
import {
  isAddressLikeQuery,
  searchMapEntities,
  buildMapSearchRows,
  MAP_ENTITY_SEARCH_LEAD_LIMIT,
} from '@/utils/mapEntitySearch'
import { fetchQuotes } from '@/utils/quotes'
import { fetchPhotoReports } from '@/utils/photoReports'
import { fetchTeamTasks } from '@/utils/tasks'

/**
 * Combines CRM entity search with Mapbox address suggestions for the map search pill.
 *
 * Rules:
 * - CRM lead matches always preferred when present (up to 5 leads + nested linked items)
 * - Address-like + CRM matches → top 1 Mapbox result above CRM
 * - Address-like + no CRM → full Mapbox suggestions
 * - Not address-like + no CRM → empty
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {object[]} opts.leads
 * @param {object[]} opts.pipelines
 * @param {Function} opts.getToken
 * @param {object|null} opts.currentUser
 * @param {object[]} opts.geocodeResults - from useMapboxGeocode
 * @param {boolean} opts.geocodeSearching
 * @param {boolean} [opts.enabled] - false when search pill is closed
 * @param {number} [opts.debounceMs]
 */
export function useMapEntitySearch({
  query,
  leads = [],
  pipelines = [],
  getToken,
  currentUser,
  geocodeResults = [],
  geocodeSearching = false,
  enabled = true,
  debounceMs = 300,
} = {}) {
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [quotes, setQuotes] = useState([])
  const [reports, setReports] = useState([])
  const [tasks, setTasks] = useState([])
  const [linkedLoading, setLinkedLoading] = useState(false)
  const fetchedForUidRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    const t = setTimeout(() => setDebouncedQuery((query || '').trim()), debounceMs)
    return () => clearTimeout(t)
  }, [query, debounceMs, enabled])

  // Lazily fetch quotes/reports/tasks once per signed-in user while search is open.
  useEffect(() => {
    if (!enabled || !currentUser || !getToken) return undefined
    const uid = currentUser.uid || currentUser.id || currentUser.email || 'user'
    if (fetchedForUidRef.current === uid) return undefined

    let cancelled = false
    setLinkedLoading(true)
    ;(async () => {
      try {
        const [quotesList, reportsList, tasksPayload] = await Promise.all([
          fetchQuotes(getToken).catch(() => []),
          fetchPhotoReports(getToken).catch(() => []),
          fetchTeamTasks(getToken).catch(() => ({ tasks: [] })),
        ])
        if (cancelled) return
        setQuotes(Array.isArray(quotesList) ? quotesList : [])
        setReports(Array.isArray(reportsList) ? reportsList : [])
        setTasks(Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : [])
        fetchedForUidRef.current = uid
      } finally {
        if (!cancelled) setLinkedLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, currentUser, getToken])

  // Clear cached linked data on sign-out
  useEffect(() => {
    if (currentUser) return
    fetchedForUidRef.current = null
    setQuotes([])
    setReports([])
    setTasks([])
  }, [currentUser])

  const addressLike = useMemo(() => isAddressLikeQuery(debouncedQuery), [debouncedQuery])

  const leadMatches = useMemo(() => {
    if (!enabled || debouncedQuery.length < 2) return []
    return searchMapEntities({
      query: debouncedQuery,
      leads,
      pipelines,
      tasks,
      quotes,
      reports,
      limit: MAP_ENTITY_SEARCH_LEAD_LIMIT,
    })
  }, [enabled, debouncedQuery, leads, pipelines, tasks, quotes, reports])

  const addressResults = useMemo(() => {
    if (!enabled || debouncedQuery.length < 2) return []
    if (leadMatches.length > 0) {
      if (!addressLike) return []
      return geocodeResults.slice(0, 1)
    }
    if (!addressLike) return []
    return geocodeResults
  }, [enabled, debouncedQuery, leadMatches.length, addressLike, geocodeResults])

  const rows = useMemo(
    () => buildMapSearchRows({ addressResults, leadMatches }),
    [addressResults, leadMatches]
  )

  const trimmedLive = (query || '').trim()
  const isSearching =
    enabled &&
    trimmedLive.length >= 2 &&
    (trimmedLive !== debouncedQuery || (addressLike && geocodeSearching))

  return {
    rows,
    leadMatches,
    addressResults,
    addressLike,
    isSearching,
    linkedLoading,
    debouncedQuery,
  }
}
