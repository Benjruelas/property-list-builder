/** Boot splash taglines — map app, public quote/report/form links. */
export const APP_LOADING_MESSAGES = {
  mapAuth: 'Loading KnockScout…',
  mapBasemap: 'Loading your map…',
  quote: 'Loading quote…',
  report: 'Loading report…',
  form: 'Loading form…',
}

/** Route kind inferred from ?quote= / ?report= / ?form= query params. */
export function getAppLoadingRoute(search = typeof window !== 'undefined' ? window.location.search : '') {
  const params = new URLSearchParams(search)
  if (params.get('quote')) return 'quote'
  if (params.get('report')) return 'report'
  if (params.get('form')) return 'form'
  return 'map'
}

/**
 * @param {{ route?: string, authLoading?: boolean, basemapLoading?: boolean }} [opts]
 */
export function getAppLoadingMessage(opts = {}) {
  const route = opts.route ?? getAppLoadingRoute()
  if (route === 'quote') return APP_LOADING_MESSAGES.quote
  if (route === 'report') return APP_LOADING_MESSAGES.report
  if (route === 'form') return APP_LOADING_MESSAGES.form
  if (opts.basemapLoading) return APP_LOADING_MESSAGES.mapBasemap
  if (opts.authLoading) return APP_LOADING_MESSAGES.mapAuth
  return APP_LOADING_MESSAGES.mapAuth
}
