import { useCallback, useEffect, useState } from 'react'
import { Building2, Loader2, RefreshCw, Star } from 'lucide-react'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { StarRating } from '../shared/StarRating'
import {
  fetchGoogleBusinessStatus,
  startGoogleBusinessConnect,
  selectGoogleBusinessLocation,
  syncGoogleBusinessReviews,
  setGoogleBusinessFeatured,
  disconnectGoogleBusiness,
  consumeGbpQueryParams,
} from '@/utils/googleBusiness'
import { cn } from '@/lib/utils'

const MAX_FEATURED = 3

function GoogleMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export function GoogleBusinessProfileSection({
  getToken,
  scope = 'user',
  teamId = null,
  canEdit = true,
  disabled = false,
  onChanged,
  className,
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState(null)
  const [pendingLocations, setPendingLocations] = useState(null)
  const [featuredDraft, setFeaturedDraft] = useState([])
  const [configured, setConfigured] = useState(true)

  const load = useCallback(async () => {
    if (!getToken) return
    setLoading(true)
    try {
      const data = await fetchGoogleBusinessStatus(getToken, { scope, teamId })
      setConfigured(data.configured !== false)
      setConnection(data.connection || null)
      setPendingLocations(data.pendingLocations || null)
      setFeaturedDraft(data.connection?.featuredReviewIds || [])
    } catch (err) {
      if (err.status === 503) {
        setConfigured(false)
        setConnection(null)
      } else {
        showToast(err.message || 'Failed to load Google Business Profile', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [getToken, scope, teamId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const params = consumeGbpQueryParams()
    if (!params) return
    const matchesScope = !params.scope || params.scope === scope
    const matchesTeam = scope !== 'team' || !params.teamId || params.teamId === teamId
    if (!matchesScope || !matchesTeam) return

    if (params.gbp === 'ok') {
      showToast('Google Business Profile connected', 'success')
      load()
      onChanged?.()
    } else if (params.gbp === 'select') {
      showToast('Choose a business location', 'info')
      load()
    } else if (params.gbp === 'error') {
      const msg = {
        not_configured: 'Google Business Profile is not configured',
        team_member: 'Team members use the team profile',
        forbidden: 'Only team admins can connect',
        no_refresh_token: 'Google did not return a refresh token — try again',
        no_locations: 'No Business Profile locations found for that Google account',
        list_locations_failed: 'Could not list business locations',
        callback_failed: 'Google connection failed',
      }[params.message] || 'Google connection failed'
      showToast(msg, 'error')
    }
  }, [scope, teamId, load, onChanged])

  const handleConnect = async () => {
    if (!canEdit || disabled) return
    setBusy(true)
    try {
      const { authUrl } = await startGoogleBusinessConnect(getToken, { scope, teamId })
      if (!authUrl) throw new Error('No auth URL returned')
      window.location.href = authUrl
    } catch (err) {
      showToast(err.message || 'Could not start Google connection', 'error')
      setBusy(false)
    }
  }

  const handleSelectLocation = async (loc) => {
    if (!canEdit || disabled) return
    setBusy(true)
    try {
      const data = await selectGoogleBusinessLocation(getToken, {
        scope,
        teamId,
        accountName: loc.accountName,
        locationName: loc.locationName,
        locationTitle: loc.locationTitle,
        mapsUri: loc.mapsUri,
      })
      setConnection(data.connection)
      setPendingLocations(null)
      setFeaturedDraft(data.connection?.featuredReviewIds || [])
      showToast('Location connected', 'success')
      onChanged?.()
    } catch (err) {
      showToast(err.message || 'Could not select location', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleSync = async () => {
    if (!canEdit || disabled) return
    setBusy(true)
    try {
      const data = await syncGoogleBusinessReviews(getToken, { scope, teamId })
      setConnection(data.connection)
      setFeaturedDraft(data.connection?.featuredReviewIds || [])
      showToast('Reviews refreshed', 'success')
      onChanged?.()
    } catch (err) {
      showToast(err.message || 'Could not refresh reviews', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    if (!canEdit || disabled) return
    const ok = await showConfirm({
      title: 'Disconnect Google Business Profile?',
      message: 'Featured reviews will stop appearing on quotes and reports.',
      confirmLabel: 'Disconnect',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const data = await disconnectGoogleBusiness(getToken, { scope, teamId })
      setConnection(data.connection)
      setFeaturedDraft([])
      setPendingLocations(null)
      showToast('Disconnected', 'success')
      onChanged?.()
    } catch (err) {
      showToast(err.message || 'Could not disconnect', 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggleFeatured = (reviewId) => {
    if (!canEdit || disabled) return
    setFeaturedDraft((prev) => {
      if (prev.includes(reviewId)) return prev.filter((id) => id !== reviewId)
      if (prev.length >= MAX_FEATURED) {
        showToast(`Pick up to ${MAX_FEATURED} featured reviews`, 'error')
        return prev
      }
      return [...prev, reviewId]
    })
  }

  const handleSaveFeatured = async () => {
    if (!canEdit || disabled) return
    setBusy(true)
    try {
      const data = await setGoogleBusinessFeatured(getToken, {
        scope,
        teamId,
        featuredReviewIds: featuredDraft,
      })
      setConnection(data.connection)
      setFeaturedDraft(data.connection?.featuredReviewIds || [])
      showToast('Featured reviews saved', 'success')
      onChanged?.()
    } catch (err) {
      showToast(err.message || 'Could not save featured reviews', 'error')
    } finally {
      setBusy(false)
    }
  }

  const connected = !!connection?.connected
  const reviews = connection?.reviews || []
  const featuredDirty =
    JSON.stringify([...(featuredDraft || [])].sort()) !==
    JSON.stringify([...(connection?.featuredReviewIds || [])].sort())

  return (
    <div className={cn('mb-5 rounded-md border border-white/10 p-3 bg-black/10', className)}>
      <div className="flex items-center gap-2 mb-2">
        <GoogleMark className="h-3.5 w-3.5" />
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Google Business Profile
        </p>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        Connect your profile to feature up to {MAX_FEATURED} reviews on quotes and reports.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : !configured ? (
        <p className="text-xs text-amber-400/90">
          Google Business Profile is not configured on this server yet.
        </p>
      ) : pendingLocations?.locations?.length ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-300">Choose a location to connect:</p>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {pendingLocations.locations.map((loc) => (
              <button
                key={loc.locationName}
                type="button"
                disabled={!canEdit || busy || disabled}
                onClick={() => handleSelectLocation(loc)}
                className="w-full text-left rounded-md border border-white/10 px-2.5 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{loc.locationTitle || loc.locationName}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : !connected ? (
        <Button
          type="button"
          size="sm"
          disabled={!canEdit || busy || disabled}
          onClick={handleConnect}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          Connect Google Business Profile
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {connection.locationTitle || 'Connected location'}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-sm font-semibold tabular-nums">
                  {(connection.averageRating || 0).toFixed(1)}
                </span>
                <StarRating rating={connection.averageRating || 0} size="sm" />
                <span className="text-[11px] text-gray-500">
                  ({connection.totalReviewCount || 0} reviews)
                </span>
              </div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || disabled}
                  onClick={handleSync}
                  title="Refresh reviews"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || disabled}
                  onClick={handleDisconnect}
                  className="text-red-400 hover:text-red-300"
                >
                  Disconnect
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Star className="h-3 w-3" />
                Reviews
                <span className="normal-case tracking-normal text-gray-600">
                  · pick up to {MAX_FEATURED} featured
                </span>
              </p>
              {canEdit && featuredDirty && (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || disabled}
                  onClick={handleSaveFeatured}
                >
                  Save featured
                </Button>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No reviews found yet. Try refresh.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 scrollbar-hide">
                {reviews.map((review) => {
                  const selected = featuredDraft.includes(review.id)
                  const atCap = featuredDraft.length >= MAX_FEATURED && !selected
                  return (
                    <label
                      key={review.id}
                      className={cn(
                        'flex gap-2 rounded-md border border-white/10 px-2 py-2 cursor-pointer',
                        selected && 'border-amber-500/40 bg-amber-500/5',
                        (!canEdit || atCap || disabled) && !selected && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selected}
                        disabled={!canEdit || busy || disabled || atCap}
                        onChange={() => toggleFeatured(review.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium truncate">
                            {review.reviewerName || 'Google user'}
                          </span>
                          <StarRating rating={review.starRating} size="sm" />
                        </span>
                        {review.comment ? (
                          <span className="block text-[11px] text-gray-400 mt-0.5 line-clamp-3">
                            {review.comment}
                          </span>
                        ) : (
                          <span className="block text-[11px] text-gray-600 mt-0.5 italic">
                            Rating only
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
