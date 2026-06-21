import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

export function resolvePublicAssetUrl(url) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const base = import.meta.env.DEV ? '' : (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}${url}`
}

export function PublicPdfDownload({ url, className }) {
  if (!url) return null
  return (
    <div className={cn('pt-2 pb-8', className)}>
      <a
        href={resolvePublicAssetUrl(url)}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-gray-300 bg-white text-gray-800 font-medium hover:bg-gray-50 transition-colors"
      >
        <Download className="h-5 w-5" />
        Download PDF
      </a>
    </div>
  )
}
