import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, X } from 'lucide-react'
import { fetchPublicReport } from '../../utils/photoReports'
import { PublicFormBrandBar } from '../forms/PublicFormBrand'
import { PublicPdfDownload } from '../shared/PublicPdfDownload'
import { QuoteBrandHeader } from '../quotes/QuoteBrandHeader'
import { cn } from '@/lib/utils'
import { PublicOwnerPreviewBackBar } from '../shared/PublicOwnerPreviewBackBar'
import { shouldShowOwnerPreviewBack } from '@/utils/clientPreview'

function resolvePhotoUrl(url) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const base = import.meta.env.DEV ? '' : (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}${url}`
}

function PhotoLightbox({ photo, onClose }) {
  if (!photo) return null
  return (
    <div
      className="public-report-lightbox fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="Close preview"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={resolvePhotoUrl(photo.imageUrl)}
        alt={photo.caption || 'Report photo'}
        className="max-h-[90vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {photo.caption ? (
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-lg text-center text-sm text-white/90 px-4">
          {photo.caption}
        </p>
      ) : null}
    </div>
  )
}

export function PublicReportPage({ token }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const showOwnerBack = shouldShowOwnerPreviewBack({ preview: data?.preview })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await fetchPublicReport(token)
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Unable to load report')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const pageClass = cn('public-form-page flex flex-col h-[100dvh] overflow-hidden bg-gray-100 text-gray-900')
  const branding = data?.branding
  const report = data?.report
  const lead = data?.lead

  const brandChrome = branding ? (
    <QuoteBrandHeader
      variant="public"
      className="quote-brand-header--page"
      businessName={branding.businessName}
      logoBase64={branding.logoBase64}
      senderName={branding.senderName}
      senderEmail={branding.senderEmail}
    />
  ) : (
    <PublicFormBrandBar className="public-form-brand-bar--page" />
  )

  if (loading) {
    return (
      <div className={pageClass}>
        <PublicFormBrandBar className="public-form-brand-bar--page" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={pageClass}>
        <PublicFormBrandBar className="public-form-brand-bar--page" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
          <h1 className="text-lg font-semibold mb-2">Report unavailable</h1>
          <p className="text-sm text-gray-600 max-w-md">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={pageClass}>
      {showOwnerBack ? <PublicOwnerPreviewBackBar /> : null}
      {brandChrome}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">
        {data?.preview && (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
            role="status"
          >
            Preview only — this is how your client will see the report.
          </div>
        )}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{report?.title || 'Photo Report'}</h1>
          {lead?.name && (
            <p className="text-sm text-gray-500 mt-1">Prepared for {lead.name}</p>
          )}
          {lead?.address && (
            <p className="text-sm text-gray-500 mt-0.5">{lead.address}</p>
          )}
          {data?.message ? (
            <p className="mt-3 text-sm text-gray-700 bg-white rounded-lg p-3 border border-gray-200 whitespace-pre-wrap">
              {data.message}
            </p>
          ) : null}
        </header>

        {(report?.sections || []).map((sec, i) => (
          <section
            key={sec.id || i}
            className="public-report-section mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
          >
            <div className="px-5 pt-5 pb-3">
              {sec.subtitle ? (
                <h2 className="text-lg font-semibold text-gray-900">{sec.subtitle}</h2>
              ) : null}
              {sec.description ? (
                <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{sec.description}</p>
              ) : null}
            </div>
            {sec.photos?.length > 0 ? (
              <div className="public-report-photo-grid px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sec.photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    className="public-report-photo-tile relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => setLightboxPhoto(photo)}
                  >
                    <img
                      src={resolvePhotoUrl(photo.thumbUrl || photo.imageUrl)}
                      alt={photo.caption || 'Report photo'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-5 pb-5 text-xs text-gray-400">No photos in this section</p>
            )}
          </section>
        ))}

        <PublicPdfDownload url={data?.pdfDownloadUrl} />
      </div>

      <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
    </div>
  )
}
