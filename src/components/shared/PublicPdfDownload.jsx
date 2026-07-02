import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveApiUrl } from '@/utils/apiBase'
import { saveBlobToDevice, safeDownloadFileName } from '@/utils/filePreview'

export function resolvePublicAssetUrl(url) {
  return resolveApiUrl(url)
}

export function PublicPdfDownload({ url, fileName = 'document.pdf', className }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!url) return null

  const handleDownload = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(resolveApiUrl(url))
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not download PDF')
      }
      const blob = await res.blob()
      if (!blob.size) throw new Error('PDF file is empty')
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      const downloadName = safeDownloadFileName(match?.[1] || fileName, 'document.pdf')
      await saveBlobToDevice(blob, downloadName, { contentType: 'application/pdf' })
    } catch (e) {
      if (e?.name === 'AbortError') return
      setError(e?.message || 'Download failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('pt-2 pb-8', className)}>
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-gray-300 bg-white text-gray-800 font-medium hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        {loading ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>
      ) : null}
    </div>
  )
}
