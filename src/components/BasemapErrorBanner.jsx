import { RefreshCw } from 'lucide-react'

/**
 * Shown when basemap tiles fail to load (no Google session and no Mapbox fallback).
 */
export function BasemapErrorBanner({ onRetry }) {
  return (
    <div
      className="basemap-error-banner"
      role="alert"
      aria-live="polite"
    >
      <span>Map tiles could not load.</span>
      <button type="button" className="basemap-error-banner__retry" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden />
        Retry
      </button>
    </div>
  )
}
